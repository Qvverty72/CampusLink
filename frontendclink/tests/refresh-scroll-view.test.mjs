import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function fixture(platform = 'web') {
  const slots = [], listeners = new Map(), scrollCalls = []; let index = 0, effects = [], lastNode, registered;
  const node = { scrollTop: 0, style: { overscrollBehaviorY: 'auto' },
    addEventListener(name, fn, options) { listeners.set(name, { fn, options }); }, removeEventListener(name) { listeners.delete(name); } };
  const host = { getScrollableNode: () => node, scrollTo: value => scrollCalls.push(value) };
  const react = {
    createContext: () => registered = { Provider: 'Provider', value: null }, useContext: context => context.value,
    forwardRef: fn => props => fn(props, props.ref),
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = index++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  react.useLayoutEffect = react.useEffect;
  const source = fs.readFileSync(new URL('../src/components/RefreshScrollView.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} }, dependencies = { react, 'react/jsx-runtime': jsx,
    'react-native': { Platform: { OS: platform }, ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', ActivityIndicator: 'Spinner', Text: 'Text', View: 'View', StyleSheet: { create: v => v } },
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56' } } };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => dependencies[name] });
  const api = module.exports;
  return { api, node, listeners, scrollCalls,
    render(props, child) { index = 0; effects = []; lastNode = api.RefreshScrollView(props); registered.value = lastNode.props.value;
      lastNode.props.children.props.ref(host); child?.(api); effects.forEach(fn => fn()); return lastNode.props.children; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    touch(name, x = 0, y = 0, options = {}) { let prevented = false; const touch = { identifier: 1, clientX: x, clientY: y };
      listeners.get(name)?.fn({ touches: [touch], cancelable: true, preventDefault() { prevented = true; }, ...options }); return prevented; },
  };
}

test('web pull refresh respects threshold/direction/top, locks duplicates and restores listeners/styles', () => {
  const f = fixture(); let calls = 0; const props = { onRefresh: () => calls++, refreshing: false, refreshLabel: 'tu perfil', indicatorColor: '#FDBB30' };
  f.render(props); assert.equal(f.node.style.overscrollBehaviorY, 'contain'); assert.equal(f.listeners.get('touchmove').options.passive, false);
  f.touch('touchstart'); assert.equal(f.touch('touchmove', 0, 63), true); f.touch('touchend'); assert.equal(calls, 0);
  f.touch('touchstart'); f.touch('touchmove', 0, 40);
  assert.match(JSON.stringify(f.render(props)), /Spinner/); f.touch('touchcancel');
  f.touch('touchstart'); f.touch('touchmove', 0, 64); f.touch('touchend'); assert.equal(calls, 1);
  // Todavía no se ha renderizado el loading que arrancan los efectos del consumidor.
  assert.match(JSON.stringify(f.render(props)), /Actualizando tu perfil/);
  f.touch('touchstart'); f.touch('touchmove', 0, 90); f.touch('touchend'); assert.equal(calls, 1);
  const loading = f.render({ ...props, refreshing: true }); assert.match(JSON.stringify(loading), /Actualizando tu perfil/);
  f.render(props); f.touch('touchstart'); f.touch('touchmove', 0, 64); f.touch('touchend'); assert.equal(calls, 2);
  f.render({ ...props, refreshing: true }); f.render(props);
  for (const [x, y] of [[90, 20], [0, -90]]) { f.touch('touchstart'); f.touch('touchmove', x, y); f.touch('touchend'); }
  f.node.scrollTop = 10; f.touch('touchstart'); f.touch('touchmove', 0, 100); f.touch('touchend'); f.node.scrollTop = 0;
  f.touch('touchstart'); f.touch('touchmove', 0, 100); f.touch('touchcancel'); f.touch('touchend');
  f.touch('touchstart'); f.touch('touchmove', 0, 100, { touches: [{ clientX: 0, clientY: 100 }, { clientX: 0, clientY: 100 }] }); f.touch('touchend');
  assert.equal(calls, 2); f.unmount(); assert.equal(f.listeners.size, 0); assert.equal(f.node.style.overscrollBehaviorY, 'auto');
});

test('iOS/Android keep the native refresh control mounted, forward refs and support accessibility and disabled states', () => {
  for (const platform of ['ios', 'android']) {
    const f = fixture(platform), ref = { current: null }; let calls = 0;
    const props = { ref, onRefresh: () => calls++, refreshing: false, refreshLabel: 'tu perfil', indicatorColor: '#FDBB30', refreshIndicatorOffset: 52 };
    let scroll = f.render(props); const control = scroll.props.refreshControl.type;
    assert.equal(scroll.props.alwaysBounceVertical, true); assert.equal(typeof ref.current.scrollTo, 'function');
    assert.equal(scroll.props.refreshControl.props.tintColor, '#FDBB30');
    assert.equal(scroll.props.refreshControl.props.progressViewOffset, 52);
    scroll.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
    scroll.props.refreshControl.props.onRefresh(); assert.equal(calls, 1);
    scroll = f.render(props);
    assert.equal(scroll.props.refreshControl.props.refreshing, true); assert.equal(scroll.props.refreshControl.props.enabled, true);
    scroll = f.render({ ...props, refreshing: true, refreshEnabled: false });
    assert.equal(scroll.props.refreshControl.type, control); assert.equal(scroll.props.refreshControl.props.refreshing, true);
    assert.equal(scroll.props.refreshControl.props.enabled, true);
    scroll.props.refreshControl.props.onRefresh(); assert.equal(calls, 1);
    scroll = f.render({ ...props, refreshEnabled: false }); scroll.props.refreshControl.props.onRefresh(); assert.equal(calls, 1);
    scroll = f.render(props); scroll.props.refreshControl.props.onRefresh(); assert.equal(calls, 2); f.unmount();
  }
});

test('child registrations share the universal context, preserve modal controls and cannot override direct props', () => {
  const f = fixture('ios'); let childCalls = 0, directCalls = 0, closes = 0; const visibility = [];
  const onRefresh = () => childCalls++, onClose = () => closes++, onHeaderVisibilityChange = value => visibility.push(value);
  const child = api => { api.useScrollRefresh(onRefresh, false, true, 'la ficha'); api.useScrollReset('detail');
    const close = api.useCompactScrollHeader(); close?.(); };
  f.render({ onClose, onHeaderVisibilityChange }, child);
  let scroll = f.render({ onClose, onHeaderVisibilityChange }, child); scroll.props.refreshControl.props.onRefresh();
  assert.equal(childCalls, 1); assert.equal(closes, 2); assert.equal(visibility[0], false); assert.equal(f.scrollCalls.length, 1);
  f.render({ onRefresh: () => directCalls++, refreshing: true });
  f.render({ onRefresh: () => directCalls++, refreshing: false });
  scroll = f.render({ onRefresh: () => directCalls++, refreshing: false }); scroll.props.refreshControl.props.onRefresh();
  assert.equal(directCalls, 1); assert.equal(childCalls, 1);
  f.unmount(); assert.equal(visibility.at(-1), true);
});

test('pestaña montada pero oculta no registra refresh y al salir libera el scroll',()=>{
 const f=fixture('ios'),onRefresh=()=>{};let active=false;
 const child=api=>api.useScrollRefresh(onRefresh,false,true,'la pestaña visible',active);
 let scroll=f.render({},child);scroll=f.render({},child);assert.equal(scroll.props.refreshControl.props.enabled,false);
 active=true;f.render({},child);scroll=f.render({},child);assert.equal(scroll.props.refreshControl.props.enabled,true);
 active=false;f.render({},child);scroll=f.render({},child);assert.equal(scroll.props.refreshControl.props.enabled,false);f.unmount();
});
