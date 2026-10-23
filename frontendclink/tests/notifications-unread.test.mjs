import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { create } from 'zustand';
import * as jsx from 'react/jsx-runtime';

function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(new URL('../src/features/users/' + file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, ...globals, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name];
  } });
  return module.exports;
}
class AuthApiError extends Error { constructor(status) { super('API error'); this.status = status; } }
function hooks() {
  const slots = []; let index = 0, focused = true, callback, cleanup, nextCallback;
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = index++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
  };
  return { react, router: { useFocusEffect: fn => { nextCallback = fn; } },
    render(fn) { index = 0; nextCallback = undefined; const state = fn();
      if (callback !== nextCallback) { cleanup?.(); callback = nextCallback; cleanup = focused ? callback?.() : undefined; } return state; },
    focus(value) { if (value === focused) return; focused = value; if (value) cleanup = callback?.(); else { cleanup?.(); cleanup = undefined; } },
  };
}
function counter() {
  const h = hooks(), calls = [], timers = new Set(), listeners = new Set(); let refreshes = 0;
  const auth = { identity: { userId: 'user-a', campusId: 'campus-a', capabilities: { general: true } }, refreshIdentity() { refreshes++; } };
  const app = { currentState: 'active', addEventListener(_, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const actualStore = load('store/notificationUnreadStore.ts', { zustand: { create } }).useNotificationUnreadStore;
  const store = Object.assign(selector => selector(actualStore.getState()), { getState: actualStore.getState });
  const { useUnreadNotificationCount } = load('hooks/useUnreadNotificationCount.ts', {
    react: h.react, 'expo-router': h.router, 'react-native': { AppState: app }, '@/features/auth/hooks/useAuth': { useAuth: () => auth },
    '@/lib/api/authenticated-request': { AuthApiError }, '../store/notificationUnreadStore': { useNotificationUnreadStore: store },
    '../api/notificationsApi': { fetchUnreadNotificationCount: signal => new Promise((resolve, reject) => calls.push({ signal, resolve, reject })) },
  }, { setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); } });
  return { calls, auth, store, timers, listeners, focus: h.focus, render: () => h.render(useUnreadNotificationCount), refreshes: () => refreshes,
    appState(value) { app.currentState = value; [...listeners].forEach(listener => listener(value)); }, tick() { [...timers].forEach(fn => fn()); } };
}

test('counter refreshes in focus/foreground, shares confirmed totals and cancels older replies', async () => {
  const h = counter(); let state = h.render(); assert.equal(state.unreadCount, null); assert.equal(h.calls.length, 1); assert.equal(state.loading, true);
  h.calls[0].resolve(45); await setImmediate(); assert.equal(h.render().unreadCount, 45);
  assert.equal(h.render().loading, false);
  h.render().refreshUnreadCount(); const old = h.calls.at(-1); h.render().refreshUnreadCount(); assert.equal(old.signal.aborted, true);
  assert.equal(h.render().loading, true); old.resolve(999); await setImmediate(); assert.equal(h.render().loading, true);
  h.calls.at(-1).resolve(44); await setImmediate(); old.resolve(999); await setImmediate(); assert.equal(h.render().unreadCount, 44);
  assert.equal(h.render().loading, false);
  h.appState('background'); const before = h.calls.length; h.tick(); assert.equal(h.calls.length, before);
  h.appState('active'); assert.equal(h.calls.length, before + 1); const pending = h.calls.at(-1);
  h.focus(false); assert.equal(pending.signal.aborted, true); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  assert.equal(h.render().loading, false);
  pending.resolve(999); await setImmediate(); assert.equal(h.store.getState().count, 44);
  h.focus(true); h.calls.at(-1).resolve(0); await setImmediate(); assert.equal(h.render().unreadCount, 0); h.focus(false);
});

test('counter hides other scopes, ignores cancelled identities and preserves last total on failure', async () => {
  const h = counter(); h.render(); h.calls[0].resolve(10); await setImmediate(); assert.equal(h.render().unreadCount, 10);
  h.render().refreshUnreadCount(); const old = h.calls.at(-1);
  h.auth.identity = { ...h.auth.identity, userId: 'user-b', campusId: 'campus-b' };
  assert.equal(h.render().unreadCount, null); assert.equal(old.signal.aborted, true); old.resolve(100); await setImmediate(); assert.equal(h.render().unreadCount, null);
  h.calls.at(-1).resolve(2); await setImmediate(); assert.equal(h.render().unreadCount, 2);
  h.render().refreshUnreadCount(); h.calls.at(-1).reject(new Error('offline')); await setImmediate(); assert.equal(h.render().unreadCount, 2);
  assert.equal(h.render().loading, false);
  h.render().refreshUnreadCount(); h.calls.at(-1).reject(new AuthApiError(403)); await setImmediate(); assert.equal(h.refreshes(), 1);
  h.auth.identity = { ...h.auth.identity, capabilities: { general: false } }; assert.equal(h.render().unreadCount, null);
  const before = h.calls.length; h.tick(); assert.equal(h.calls.length, before); h.focus(false);
});

test('counter API rejects invalid counts and forwards cancellation to the authenticated endpoint', async () => {
  let value = { unreadCount: 150 }, captured;
  const api = load('api/notificationsApi.ts', { '@/lib/api/authenticated-request': {
    authenticatedEnvelopeRequest: async (path, init) => { captured = { path, init }; return { data: value }; },
  } }, { URLSearchParams });
  const abort = new AbortController(); assert.equal(await api.fetchUnreadNotificationCount(abort.signal), 150);
  assert.equal(captured.path, '/api/v1/users/me/notifications/unread-count'); assert.equal(captured.init.signal, abort.signal);
  for (const invalid of [-1, 1.5, '5', null, undefined, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    value = { unreadCount: invalid }; await assert.rejects(api.fetchUnreadNotificationCount(), /contador/);
  }
});

function inbox() {
  const h = hooks(), lists = [], changes = []; let confirmations = 0;
  const { useActivityNotifications } = load('hooks/useActivityNotifications.ts', {
    react: h.react, 'expo-router': h.router, '@/features/auth/hooks/useAuth': { useAuth: () => ({ refreshIdentity() {} }) },
    '@/lib/api/authenticated-request': { AuthApiError }, '../api/notificationsApi': {
      fetchNotifications: (cursor, signal) => new Promise((resolve, reject) => lists.push({ cursor, signal, resolve, reject })),
      updateNotification: (id, remove, signal) => new Promise((resolve, reject) => changes.push({ id, remove, signal, resolve, reject })),
    },
  });
  const notified = () => { confirmations++; };
  return { render: () => h.render(() => useActivityNotifications(notified)), focus: h.focus, lists, changes, confirmations: () => confirmations };
}
const item = { id: 'notice', type: 'OFFICIAL_EVENT_PUBLISHED', activityId: 'activity', title: 'Evento', readAt: null };

test('refresh replaces the paginated inbox from page one, preserves failures and cancels obsolete loads', async () => {
  const h = inbox(); h.render(); h.lists[0].resolve({ items: [item], nextCursor: 'page-two' }); await setImmediate();
  const more = h.render().load('page-two'); assert.equal(h.lists[1].cursor, 'page-two');
  h.lists[1].resolve({ items: [{ ...item, id: 'second' }], nextCursor: 'page-three' }); await more;
  assert.equal(h.render().items.length, 2);
  const refresh = h.render().load(); assert.equal(h.lists[2].cursor, undefined); assert.equal(h.render().busy, true);
  await h.render().load(); assert.equal(h.lists.length, 3);
  h.lists[2].resolve({ items: [{ ...item, id: 'new' }], nextCursor: 'new-page-two' }); await refresh;
  assert.deepEqual(h.render().items.map(row => row.id), ['new']); assert.equal(h.render().cursor, 'new-page-two'); assert.equal(h.confirmations(), 0);
  const failed = h.render().load(); h.lists[3].reject(new Error('offline')); await failed;
  assert.equal(h.render().busy, false); assert.ok(h.render().error); assert.equal(h.render().items[0].id, 'new');
  const cancelled = h.render().load(); h.focus(false); assert.equal(h.lists[4].signal.aborted, true);
  h.lists[4].resolve({ items: [], nextCursor: null }); await cancelled; assert.equal(h.render().items[0].id, 'new');
});

test('notification modal uses pull refresh without a manual button and protects loading/detail flows', async () => {
  const h = hooks(), calls = []; let finish;
  const state = { items: [{ ...item, message: 'Aviso', createdAt: '2026-10-23T12:00:00Z' }], cursor: 'page-two', busy: false, error: null,
    activityId: null, publicationId: null, setActivityId() {}, setPublicationId() {}, update() {},
    load(cursor) { calls.push(['list', cursor]); return new Promise(resolve => { finish = resolve; }); } };
  const counter = { unreadCount: 1, loading: false, refreshUnreadCount() { calls.push(['count']); } };
  const { NotificationsScreen } = load('components/ActivityNotifications.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back() {} }) },
    'lucide-react-native': Object.fromEntries(['BellOff', 'ChevronRight', 'Trash2', 'X'].map(name => [name, () => null])),
    'react-native': { ActivityIndicator: 'Spinner', Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: v => v } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) },
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity: { userId: 'user', campusId: 'campus' } }) },
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56', SECONDARY: '#3F6A8E', ACCENT: '#FDBB30' } },
    '@/components/RefreshScrollView': { RefreshScrollView: 'UniversalScroll' },
    '@/features/activities/components/ActivityDetail': { ActivityDetail: () => null },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory': { PhysicalgoodsHistoryDetail: () => null },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction': { PhysicalgoodsTransaction: () => null },
    '../hooks/useActivityNotifications': { useActivityNotifications: () => state }, '../hooks/useUnreadNotificationCount': { useUnreadNotificationCount: () => counter },
  });
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
  const root = NotificationsScreen(), render = () => elements(h.render(() => root.type(root.props)));
  let tree = render(), scroll = tree.find(node => node.type === 'UniversalScroll' && node.props.onRefresh);
  assert.equal(tree.some(node => node.props?.accessibilityLabel === 'Actualizar notificaciones'), false);
  assert.ok(tree.some(node => node.props?.accessibilityLabel === 'Cerrar notificaciones'));
  assert.equal(scroll.props.contentContainerStyle.flexGrow, 1); assert.equal(scroll.props.refreshEnabled, true);
  const refreshing = scroll.props.onRefresh(); assert.deepEqual(calls, [['count'], ['list', undefined]]);
  scroll = render().find(node => node.type === 'UniversalScroll' && node.props.onRefresh);
  assert.equal(scroll.props.refreshing, true); assert.equal(scroll.props.refreshEnabled, false);
  assert.equal(render().some(node => node.type === 'Spinner'), false); finish(); await refreshing;
  tree = render(); const more = tree.find(node => node.type === 'Button' && node.props.children?.props?.children === 'Cargar más');
  more.props.onPress(); assert.deepEqual(calls.at(-1), ['list', 'page-two']); finish(); await setImmediate();
  for (const property of ['busy', 'activityId', 'publicationId']) {
    state[property] = property === 'busy' ? true : 'target';
    assert.equal(render().find(node => node.type === 'UniversalScroll' && node.props.onRefresh).props.refreshEnabled, false);
    state[property] = property === 'busy' ? false : null;
  }
  counter.loading = true; assert.equal(render().find(node => node.type === 'UniversalScroll' && node.props.onRefresh).props.refreshEnabled, false);
  counter.loading = false; state.items = []; state.error = 'Sin conexión';
  assert.equal(render().find(node => node.type === 'UniversalScroll' && node.props.onRefresh).props.refreshEnabled, true);
});

test('read/delete refresh totals only after server acknowledgement and preserve target routing', async () => {
  const h = inbox(); h.render(); h.lists[0].resolve({ items: [item], nextCursor: null }); await setImmediate();
  let state = h.render(); const read = state.update(item, false); assert.equal(h.confirmations(), 0); assert.equal(h.render().items[0].readAt, null);
  h.changes[0].resolve(); await read; state = h.render(); assert.equal(h.confirmations(), 1); assert.ok(state.items[0].readAt); assert.equal(state.activityId, item.activityId);
  const remove = state.update(item, true); assert.equal(h.confirmations(), 1); h.changes[1].resolve(); await remove;
  assert.equal(h.confirmations(), 2); assert.equal(h.render().items.length, 0); h.focus(false);
});

test('failed and aborted mutations never refresh a different scope; physical reminders keep their target', async () => {
  const h = inbox(), reminder = { ...item, type: 'PHYSICAL_PUBLICATION_CLOSE_REMINDER', publicationId: 'publication' };
  h.render(); h.lists[0].resolve({ items: [reminder], nextCursor: null }); await setImmediate();
  let state = h.render(); const failed = state.update(reminder, true); h.changes[0].reject(new Error('offline')); await failed;
  assert.equal(h.confirmations(), 0); assert.equal(h.render().items.length, 1);
  state = h.render(); const open = state.update(reminder, false); h.changes[1].resolve(); await open;
  assert.equal(h.render().publicationId, reminder.publicationId); assert.equal(h.confirmations(), 1);
  state = h.render(); const cancelled = state.update(reminder, true); h.focus(false); assert.equal(h.changes[2].signal.aborted, true);
  h.changes[2].resolve(); await cancelled; assert.equal(h.confirmations(), 1);
});
