import { loadSafeArea } from './helpers/safe-area.mjs';
﻿import assert from 'node:assert/strict';
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
    if (name === '@/lib/layout/safeArea') return loadSafeArea(dependencies['react-native']?.Platform?.OS); assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name];
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

test('change API validates both snapshots and notification identity before exposing a comparison', async () => {
  const id = '11111111-1111-4111-8111-111111111111', activityId = '1234567890abcdef12345678', calls = [];
  const snapshot = { title: 'Taller', description: 'Descripción', startAt: '2099-10-21T18:00:00Z', endAt: '2099-10-21T20:00:00Z',
    location: { buildingKey: 'a', floorKey: 'a1', buildingName: 'Cabaña A', floorName: 'Piso 1' } };
  const valid = { notificationId: id, activityId, title: 'Taller', before: snapshot, after: snapshot };
  let response = valid;
  const { fetchNotificationActivityChange } = load('api/notificationsApi.ts', {
    '@/lib/api/authenticated-request': { async authenticatedEnvelopeRequest(...args) { calls.push(args); return { data: response }; } },
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await fetchNotificationActivityChange(id, signal), valid);
  assert.equal(calls[0][0], `/api/v1/users/me/notifications/${id}/activity-change`); assert.equal(calls[0][1].signal, signal);
  for (const invalid of [null, { ...valid, notificationId: 'other' }, { ...valid, activityId: 'invalid' },
    { ...valid, before: null }, { ...valid, after: { ...snapshot, endAt: snapshot.startAt } },
    { ...valid, before: { ...snapshot, location: { buildingKey: 'a' } } }, { ...valid, after: { ...snapshot, startAt: 'bad' } }]) {
    response = invalid; await assert.rejects(fetchNotificationActivityChange(id));
  }
  response = { ...valid, before: { ...snapshot, location: null } }; assert.equal((await fetchNotificationActivityChange(id)).before.location, null);
  const count = calls.length; await assert.rejects(fetchNotificationActivityChange('invalid')); assert.equal(calls.length, count);
});

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
  const h = inbox(); assert.equal(h.render().loading, true); assert.equal(h.render().loadingMore, false);
  h.lists[0].resolve({ items: [item], nextCursor: 'page-two' }); await setImmediate(); assert.equal(h.render().loading, false);
  const more = h.render().load('page-two'); assert.equal(h.lists[1].cursor, 'page-two');
  assert.equal(h.render().loadingMore, true); assert.equal(h.render().items[0].id, item.id);
  h.lists[1].resolve({ items: [{ ...item, id: 'second' }], nextCursor: 'page-three' }); await more;
  assert.equal(h.render().items.length, 2);
  const refresh = h.render().load(); assert.equal(h.lists[2].cursor, undefined); assert.equal(h.render().busy, true);
  assert.equal(h.render().loading, true); assert.equal(h.render().loadingMore, false);
  await h.render().load(); assert.equal(h.lists.length, 3);
  h.lists[2].resolve({ items: [{ ...item, id: 'new' }], nextCursor: 'new-page-two' }); await refresh;
  assert.deepEqual(h.render().items.map(row => row.id), ['new']); assert.equal(h.render().cursor, 'new-page-two'); assert.equal(h.confirmations(), 0);
  const failed = h.render().load(); h.lists[3].reject(new Error('offline')); await failed;
  assert.equal(h.render().busy, false); assert.ok(h.render().error); assert.equal(h.render().items[0].id, 'new');
  assert.equal(h.render().loading, false);
  const cancelled = h.render().load(); h.focus(false); assert.equal(h.lists[4].signal.aborted, true);
  assert.equal(h.render().loading, false);
  h.lists[4].resolve({ items: [], nextCursor: null }); await cancelled; assert.equal(h.render().items[0].id, 'new');
});

test('notification modal uses pull refresh without a manual button and protects loading/detail flows', async () => {
  const h = hooks(), calls = []; let finish;
  const row = () => null, detail = () => null, activity = () => null, skeleton = () => null;
  const state = { items: [{ ...item, message: 'Aviso', createdAt: '2026-10-23T12:00:00Z' }], cursor: 'page-two', busy: false, loading: false, loadingMore: false, error: null,
    activityId: null, publicationId: null, setActivityId() {}, setPublicationId() {}, update(item, remove) { calls.push(['update', item.id, remove]); },
    load(cursor) { calls.push(['list', cursor]); return new Promise(resolve => { finish = resolve; }); } };
  const counter = { unreadCount: 1, loading: false, refreshUnreadCount() { calls.push(['count']); } };
  const { NotificationsScreen } = load('components/ActivityNotifications.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back() {}, dismissTo(target) { calls.push(['map', target]); } }) },
    'lucide-react-native': Object.fromEntries(['BellOff', 'ChevronRight', 'Trash2', 'X'].map(name => [name, () => null])),
    'react-native': { ActivityIndicator: 'Spinner', Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: v => v } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) },
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity: { userId: 'user', campusId: 'campus' } }) },
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56', SECONDARY: '#3F6A8E', ACCENT: '#FDBB30' } },
    '@/components/RefreshScrollView': { RefreshScrollView: 'UniversalScroll' },
    './NotificationActivityModal': { NotificationActivityModal: activity },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory': { PhysicalgoodsHistoryDetail: detail },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction': { PhysicalgoodsTransaction: () => null },
    '../hooks/useActivityNotifications': { useActivityNotifications: () => state }, '../hooks/useUnreadNotificationCount': { useUnreadNotificationCount: () => counter },
    './NotificationItem': { NotificationItem: row }, '../utils/notificationPresentation': load('utils/notificationPresentation.ts', {}),
    './NotificationSkeleton': { NotificationSkeleton: skeleton },
  });
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
  const root = NotificationsScreen(), render = () => elements(h.render(() => root.type(root.props)));
  let tree = render(), scroll = tree.find(node => node.type === 'UniversalScroll' && node.props.onRefresh);
  assert.equal(tree.some(node => node.props?.accessibilityLabel === 'Actualizar notificaciones'), false);
  assert.ok(tree.some(node => node.props?.accessibilityLabel === 'Cerrar notificaciones'));
  const notice = tree.find(node => node.type === row);
  notice.props.onOpen(); assert.deepEqual(calls.pop(), ['update', item.id, false]);
  state.activityId = item.activityId;
  assert.equal(render().find(node => node.type === activity).props.notificationId, item.id);
  state.activityId = null;
  notice.props.onDelete(); assert.deepEqual(calls.pop(), ['update', item.id, true]);
  assert.equal(scroll.props.contentContainerStyle.flexGrow, 1); assert.equal(scroll.props.refreshEnabled, true);
  const refreshing = scroll.props.onRefresh(); assert.deepEqual(calls, [['count'], ['list', undefined]]);
  tree = render(); scroll = tree.find(node => node.type === 'UniversalScroll' && node.props.onRefresh);
  assert.equal(tree.some(node => node.type === skeleton), true); assert.equal(tree.some(node => node.type === row), false);
  assert.equal(scroll.props.refreshing, true); assert.equal(scroll.props.refreshEnabled, false);
  assert.equal(render().some(node => node.type === 'Spinner'), false); finish(); await refreshing;
  tree = render(); const more = tree.find(node => node.type === 'Button' && node.props.children?.props?.children === 'Cargar más');
  more.props.onPress(); assert.deepEqual(calls.at(-1), ['list', 'page-two']); finish(); await setImmediate();
  state.loading = true; state.loadingMore = true; tree = render();
  assert.equal(tree.some(node => node.type === row), true);
  assert.equal(tree.find(node => node.type === skeleton).props.rows, 2);
  assert.equal(tree.find(node => node.type === skeleton).props.heading, false);
  state.loadingMore = false; tree = render();
  assert.equal(tree.some(node => node.type === row), false); assert.equal(tree.some(node => node.type === skeleton), true);
  state.loading = false;
  for (const property of ['busy', 'activityId', 'publicationId']) {
    state[property] = property === 'busy' ? true : 'target';
    tree = render(); assert.equal(tree.find(node => node.type === 'UniversalScroll' && node.props.onRefresh).props.refreshEnabled, false);
    if (property === 'activityId') { const target = tree.find(node => node.type === activity);
      assert.equal(target.props.activityId, 'target'); assert.equal(target.props.notificationType, 'OFFICIAL_EVENT_PUBLISHED');
      target.props.onExplore('target'); assert.equal(calls.at(-1)[0], 'map'); assert.equal(calls.at(-1)[1].pathname, '/map'); assert.equal(calls.at(-1)[1].params.activityId, 'target'); }
    if (property === 'publicationId') { const target = tree.find(node => node.type === detail);
      assert.equal(target.props.target.publicationId, 'target'); assert.equal(target.props.onOpen, undefined);
      assert.equal(target.props.refreshEnabled, false); }
    assert.equal(tree.some(node => node.type === skeleton), false);
    assert.equal(tree.some(node => node.type === 'Spinner'), false);
    state[property] = property === 'busy' ? false : null;
  }
  counter.loading = true; assert.equal(render().find(node => node.type === 'UniversalScroll' && node.props.onRefresh).props.refreshEnabled, false);
  counter.loading = false; state.items = []; state.error = 'Sin conexión';
  assert.equal(render().find(node => node.type === 'UniversalScroll' && node.props.onRefresh).props.refreshEnabled, true);
  assert.equal(render().some(node => node.type === skeleton), false);
  state.error = null; state.loading = true; tree = render();
  assert.equal(tree.some(node => node.type === skeleton), true);
  assert.equal(tree.some(node => node.props?.children === 'No tienes notificaciones'), false);
  state.loading = false; assert.equal(render().some(node => node.props?.children === 'No tienes notificaciones'), true);
});

test('notification groups use the local Monday boundary and preserve order without losing older pages', () => {
  const { groupNotifications, formatNotificationDate } = load('utils/notificationPresentation.ts', {});
  const now = new Date(2026, 9, 23, 12);
  const recent = { ...item, createdAt: new Date(2026, 9, 19, 0).toISOString() };
  const older = { ...item, id: 'previous-week', createdAt: new Date(2026, 9, 18, 23, 59, 59).toISOString() };
  const sunday = { ...item, id: 'sunday', createdAt: new Date(2026, 9, 25, 23).toISOString() };
  let groups = groupNotifications([sunday, recent, older], now);
  assert.deepEqual(Array.from(groups, group => group.title), ['Esta semana', 'Anteriores']);
  assert.deepEqual(Array.from(groups[0].items, row => row.id), ['sunday', recent.id]);
  assert.equal(groups[1].items[0].id, older.id);
  groups = groupNotifications([recent], new Date(2026, 9, 26)); assert.equal(groups[0].title, 'Anteriores');
  assert.equal(groupNotifications([], now).length, 0);
  assert.match(formatNotificationDate('2025-10-21T12:00:00Z', now), /2025/);
});

test('notification rows distinguish every supported type, open on tap and expose full message/delete through options', () => {
  const presentation = load('utils/notificationPresentation.ts', {});
  const icons = Object.fromEntries(['CalendarDays', 'CalendarClock', 'CalendarSync', 'Store', 'Ellipsis', 'Trash2'].map(name => [name, () => null]));
  const expected = { OFFICIAL_EVENT_PUBLISHED: 'CalendarDays', OFFICIAL_EVENT_STARTED: 'CalendarClock', ACTIVITY_CHANGED: 'CalendarSync', PHYSICAL_PUBLICATION_CLOSE_REMINDER: 'Store' };
  for (const [type, icon] of Object.entries(expected)) {
    const h = hooks(); let opened = 0, deleted = 0;
    const notice = { ...item, type, title: 'Aviso con nombre extenso', message: 'Motivo completo del aviso', createdAt: '2026-10-23T12:00:00Z' };
    const { NotificationItem } = load('components/NotificationItem.tsx', { react: h.react, 'react/jsx-runtime': jsx, 'lucide-react-native': icons,
      'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
      '@/types/colors': { APP_COLORS: { SECONDARY: '#3F6A8E', ACCENT: '#FDBB30' } }, '../utils/notificationPresentation': presentation,
    });
    const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
    let busy = false;
    const render = () => elements(h.render(() => NotificationItem({ item: notice, busy, onOpen: () => opened++, onDelete: () => deleted++ })));
    let tree = render(); assert.ok(tree.some(node => node.type === icons[icon]));
    assert.ok(tree.some(node => node.props?.style?.backgroundColor === '#FDBB30'));
    const open = tree.find(node => node.props?.accessibilityHint); assert.match(open.props.accessibilityLabel, /Motivo completo del aviso/);
    open.props.onPress(); assert.equal(opened, 1); assert.equal(deleted, 0);
    tree.find(node => node.props?.accessibilityLabel?.startsWith('Opciones')).props.onPress(); tree = render();
    assert.ok(tree.some(node => node.props?.children === notice.message));
    tree.find(node => node.props?.accessibilityLabel?.startsWith('Eliminar')).props.onPress(); assert.equal(deleted, 1);
    notice.readAt = '2026-10-23T13:00:00Z'; tree = render();
    assert.equal(tree.some(node => node.props?.style?.backgroundColor === '#FDBB30'), false);
    busy = true; tree = render(); assert.equal(tree.filter(node => node.type === 'Button').every(node => node.props.disabled), true);
  }
});

test('read/delete refresh totals only after server acknowledgement and preserve target routing', async () => {
  for (const type of ['OFFICIAL_EVENT_PUBLISHED', 'OFFICIAL_EVENT_STARTED', 'ACTIVITY_CHANGED']) {
    const notice = { ...item, type }, h = inbox();
    h.render(); h.lists[0].resolve({ items: [notice], nextCursor: null }); await setImmediate();
    let state = h.render(); const read = state.update(notice, false); assert.equal(h.confirmations(), 0); assert.equal(h.render().items[0].readAt, null);
    assert.equal(h.render().loading, false); assert.equal(h.render().busy, true);
    assert.equal(h.render().activityId, null);
    h.changes[0].resolve(); await read; state = h.render(); assert.equal(h.confirmations(), 1); assert.ok(state.items[0].readAt); assert.equal(state.activityId, notice.activityId);
    const remove = state.update(notice, true); assert.equal(h.confirmations(), 1); h.changes[1].resolve(); await remove;
    assert.equal(h.confirmations(), 2); assert.equal(h.render().items.length, 0); h.focus(false);
  }
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
