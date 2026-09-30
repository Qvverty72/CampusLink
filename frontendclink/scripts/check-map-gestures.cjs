// Exercise the real gesture handlers without requiring a GPU or live backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(bounds) {
  const refs = [];
  const react = {
    useRef(value) { const ref = { current: value }; refs.push(ref); return ref; },
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
  };
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', StyleSheet: { create: (styles) => styles }, PanResponder: { create: (handlers) => ({ panHandlers: handlers }) } },
    '@react-three/fiber/native': { Canvas: 'Canvas' },
    '@/three/components/CampusModel': { CampusModelScene: 'Scene' },
    '@/three/controls/CameraController': { CameraController: 'Controller' },
    '@/three/controls/cameraConfig': { clampCameraPhi: (value) => value },
    '@/theme/tokens': { colors: {} },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/three/components/CampusMap.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(id) { assert.ok(id in mocks, id); return mocks[id]; }, Date });
  const tree = exports.CampusMap();
  tree.props.ref.current = { measure(callback) { callback(0, 0, bounds.width, bounds.height, bounds.x, bounds.y); } };
  return { handlers: tree.props, state: refs[1].current };
}

function tap(bounds, x, y) {
  const map = mount(bounds);
  map.handlers.onTouchStart({ nativeEvent: { touches: [{ pageX: x, pageY: y }] } });
  map.handlers.onTouchEnd();
  return map.state;
}

for (const bounds of [
  { x: 0, y: 0, width: 320, height: 600 },
  { x: 16, y: 96, width: 320, height: 480 },
  { x: 48, y: 32, width: 700, height: 260 },
]) {
  const center = tap(bounds, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  assert.equal(center.hasPendingTap, true);
  assert.equal(center.tapX, 0);
  assert.equal(center.tapY, 0);
  const corner = tap(bounds, bounds.x, bounds.y);
  assert.equal(corner.tapX, -1);
  assert.equal(corner.tapY, 1);
  assert.equal(tap(bounds, bounds.x - 1, bounds.y).hasPendingTap, false);
}
assert.equal(tap({ x: 0, y: 0, width: 0, height: 0 }, 0, 0).hasPendingTap, false);
const multi = mount({ x: 0, y: 0, width: 320, height: 600 });
multi.handlers.onTouchStart({ nativeEvent: { touches: [{ pageX: 1, pageY: 1 }, { pageX: 2, pageY: 2 }] } });
multi.handlers.onTouchEnd();
assert.equal(multi.state.hasPendingTap, false);
const drag = mount({ x: 0, y: 0, width: 320, height: 600 });
drag.handlers.onTouchStart({ nativeEvent: { touches: [{ pageX: 100, pageY: 100 }] } });
drag.handlers.onMoveShouldSetPanResponder({ nativeEvent: { touches: [{}] } }, { dx: 20, dy: 0 });
drag.handlers.onTouchEnd();
assert.equal(drag.state.hasPendingTap, false);
console.log('Map gesture regression passed: offsets, resized viewports, bounds, zero size, multi-touch and drag.');
