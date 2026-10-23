import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, dependencies) {
  const source = fs.readFileSync(new URL('../src/features/users/' + file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, URLSearchParams, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name];
  } });
  return module.exports;
}

test('personal APIs use authenticated server queries, validate scope/counts and forward cancellation', async () => {
  let value, captured;
  const api = load('api/profilePersonalApi.ts', { '@/lib/api/authenticated-request': {
    authenticatedEnvelopeRequest: async (path, init, query) => { captured = { path, init, query }; return { data: value }; },
  } });
  const abort = new AbortController();
  value = { activePublications: 2, pendingRequests: 1, transactions: 5, acquiredResources: 3 };
  assert.equal((await api.fetchProfileOverview(abort.signal)).acquiredResources, 3);
  assert.equal(captured.path, '/api/v1/users/me/overview'); assert.equal(captured.init.signal, abort.signal);
  for (const count of [-1, '1', undefined, 0.5, Infinity]) {
    value = { ...value, acquiredResources: count }; await assert.rejects(api.fetchProfileOverview(), /resumen/);
  }
  value = { campusId: 'campus', total: 4 };
  assert.equal(await api.fetchOwnActivityCount('campus', abort.signal), 4);
  assert.equal(captured.path, '/api/v1/activities/mine/count');
  await assert.rejects(api.fetchOwnActivityCount('another'), /inscripciones/);
  const row = { id: '123456789012345678901234', campusId: 'campus', title: 'Taller', description: 'Descripción', type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE',
    startAt: '2099-10-23T12:00:00Z', endAt: '2099-10-23T14:00:00Z', location: { buildingName: 'Edificio', floorName: 'Piso' } };
  value = { campusId: 'campus', total: 11, page: 2, limit: 10, hasMore: false, items: [row] };
  assert.equal((await api.fetchOwnActivities('campus', 2, abort.signal)).items[0].title, 'Taller');
  assert.equal(captured.query.toString(), 'page=2&limit=10'); assert.equal(captured.init.signal, abort.signal);
  for (const change of [{ campusId: 'another' }, { id: '../map' }, { status: 'HIDDEN' }, { startAt: 'invalid' }]) {
    value.items = [{ ...row, ...change }]; await assert.rejects(api.fetchOwnActivities('campus', 2), /inscripciones/);
  }
});

function hooks() {
  const slots = []; let index = 0, effects = [], focused = true, focusCallback, focusCleanup, nextFocus;
  const react = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useCallback(fn, deps) { const i = index++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = index++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, router: { useFocusEffect: fn => { nextFocus = fn; } },
    render(fn) { index = 0; effects = []; const value = fn(); effects.forEach(fn => fn());
      if (focusCallback !== nextFocus) { focusCleanup?.(); focusCallback = nextFocus; focusCleanup = focused ? focusCallback?.() : undefined; }
      return value; },
    blur() { focused = false; focusCleanup?.(); }, focus() { focused = true; focusCleanup = focusCallback?.(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); focusCleanup?.(); },
  };
}

test('activity pages cancel obsolete replies and do not turn errors into empty successful lists', async () => {
  const h = hooks(), requests = [];
  const { useOwnActivities } = load('hooks/useOwnActivities.ts', { react: h.react, '../api/profilePersonalApi': {
    fetchOwnActivities: (campusId, page, signal) => new Promise((resolve, reject) => requests.push({ campusId, page, signal, resolve, reject })),
  } });
  const render = () => h.render(() => useOwnActivities('campus'));
  render(); assert.equal(requests.length, 1);
  requests[0].resolve({ items: [{ id: 'one' }], page: 1 }); await setImmediate();
  assert.equal(render().result.items[0].id, 'one');
  render().setPage(2); render(); assert.equal(requests[0].signal.aborted, true);
  assert.equal(render().result, null); requests[1].reject(new Error('offline')); await setImmediate();
  assert.match(render().error, /Reintenta/); assert.equal(render().result, null);
  render().reload(); render(); const pending = requests.at(-1); h.unmount(); assert.equal(pending.signal.aborted, true);
  pending.resolve({ items: [{ id: 'stale' }] }); await setImmediate(); assert.equal(render().result, null);
});

test('profile loads only counters, cancels on blur and refreshes after returning from a modal', async () => {
  const h = hooks(), requests = [];
  const call = (kind, signal) => new Promise((resolve, reject) => requests.push({ kind, signal, resolve, reject }));
  const { useProfileOverview } = load('hooks/useProfileOverview.ts', { react: h.react, 'expo-router': h.router, '../api/profilePersonalApi': {
    fetchProfileOverview: signal => call('overview', signal), fetchOwnActivityCount: (_campus, signal) => call('count', signal),
  } });
  const render = () => h.render(() => useProfileOverview('campus'));
  render(); assert.deepEqual(requests.map(r => r.kind), ['overview', 'count']);
  h.blur(); assert.ok(requests.every(r => r.signal.aborted)); requests[0].resolve({ activePublications: 999 }); requests[1].resolve(999); await setImmediate();
  assert.equal(render().overview, null); assert.equal(render().activities, null);
  h.focus(); requests[2].resolve({ activePublications: 2 }); requests[3].resolve(1); await setImmediate();
  assert.equal(render().overview.activePublications, 2); assert.equal(render().activities, 1);
  h.blur(); h.focus(); requests[4].reject(new Error('offline')); requests[5].resolve(0); await setImmediate();
  assert.equal(render().failed, true); assert.equal(render().overview.activePublications, 2); assert.equal(render().activities, 0);
  assert.equal(render().loading, false); h.unmount();
});

test('manual profile refresh retains known counts, waits for both queries and hides other user/campus data', async () => {
  const h = hooks(), requests = []; let campus = 'campus-a', user = 'user-a';
  const call = signal => new Promise((resolve, reject) => requests.push({ signal, resolve, reject }));
  const { useProfileOverview } = load('hooks/useProfileOverview.ts', { react: h.react, 'expo-router': h.router, '../api/profilePersonalApi': {
    fetchProfileOverview: call, fetchOwnActivityCount: (_campus, signal) => call(signal),
  } });
  const render = () => h.render(() => useProfileOverview(campus, user));
  render(); assert.equal(render().loading, true);
  requests[0].resolve({ activePublications: 4 }); await setImmediate(); assert.equal(render().loading, true);
  requests[1].resolve(3); await setImmediate(); assert.equal(render().loading, false);
  render().retry(); render(); assert.equal(render().overview.activePublications, 4); assert.equal(render().activities, 3); assert.equal(render().loading, true);
  user = 'user-b'; const next = render(); assert.equal(next.overview, null); assert.equal(next.activities, null);
  assert.equal(requests[2].signal.aborted, true); requests[2].resolve({ activePublications: 999 }); requests[3].resolve(999); await setImmediate();
  assert.equal(render().overview, null); campus = null; render(); assert.equal(render().loading, false);
  assert.equal(requests[4].signal.aborted, true); h.unmount();
});

test('academic reload preserves confirmed data while loading and discards cancelled identity replies', async () => {
  const h = hooks(), requests = []; let identity = { userId: 'user-a', campusId: 'campus-a', capabilities: { general: true }, roles: [], profile: {} };
  const { useProfile } = load('hooks/useProfile.ts', { react: h.react, '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity, signOut: async () => {} }) },
    '../api/profileApi': { loadAcademicProfile: signal => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })) },
  });
  const render = () => h.render(useProfile);
  render(); assert.equal(render().academicLoading, true);
  requests[0].resolve({ fullName: 'Carlos', campusName: 'San Andrés', careers: [] }); await setImmediate();
  render().reloadAcademicProfile(); render(); assert.equal(render().academicLoading, true); assert.equal(render().academicProfile.fullName, 'Carlos');
  requests[1].reject(new Error('offline')); await setImmediate(); assert.equal(render().academicLoading, false);
  assert.equal(render().academicProfile.campusName, 'San Andrés'); assert.ok(render().academicError);
  render().reloadAcademicProfile(); render(); const old = requests.at(-1);
  identity = { ...identity, userId: 'user-b' }; assert.equal(render().academicProfile, null); assert.equal(old.signal.aborted, true);
  old.resolve({ fullName: 'Old' }); await setImmediate(); assert.equal(render().academicProfile, null);
  h.unmount(); assert.equal(requests.at(-1).signal.aborted, true);
});

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(4).flatMap(elements)];
}

test('profile wires the universal pull gesture to academic data, counters and bell, with loading/modal guards', () => {
  const h = hooks(), calls = [], state = { academicLoading: false, academicProfile: { fullName: 'Carlos actualizado', careers: [] }, closing: false };
  const summary = { loading: false, retry: () => calls.push('summary') };
  const identity = { userId: 'user', campusId: 'campus', capabilities: { general: true }, roles: [], profile: { nombre_completo: 'Carlos anterior' } };
  const academicSkeleton = () => null, countSkeleton = () => null, cards = () => null;
  const notifications = { unreadCount: 7, loading: false, refreshUnreadCount: () => calls.push('bell') };
  const { ProfileScreen } = load('components/ProfileScreen.tsx', {
    react: h.react, 'react/jsx-runtime': jsx, 'expo-router': { Link: 'Link' },
    'lucide-react-native': Object.fromEntries(['Bell', 'ChartColumn', 'ChevronRight', 'Clock3', 'Flag', 'GraduationCap', 'MapPin', 'UsersRound'].map(name => [name, () => null])),
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: v => v, flatten: v => v } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) },
    '@/components/navigation/BottomNavigationBar': { BottomNavigationBar: () => null }, '@/components/RefreshScrollView': { RefreshScrollView: 'UniversalScroll' },
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56', SECONDARY: '#3F6A8E', ACCENT: '#FDBB30' } },
    '../hooks/useProfile': { useProfile: () => ({ ...state, identity, auth: { session: { user: { email: 'test@duocuc.cl' } }, refreshIdentity: () => calls.push('identity') }, reloadAcademicProfile: () => calls.push('academic') }) },
    '../hooks/useUnreadNotificationCount': { useUnreadNotificationCount: () => notifications },
    '../hooks/useProfileOverview': { useProfileOverview: () => summary }, './ProfileAccountModal': { ProfileAccountModal: () => null },
    './ProfilePersonalCards': { ProfilePersonalCards: cards }, './ProfileSkeleton': { ProfileAcademicSkeleton: academicSkeleton, ProfileNotificationCountSkeleton: countSkeleton },
    '../types/access': { canManageAccess: () => false }, '@/features/analytics/types/access': { canAccessAnalytics: () => false },
  });
  const render = () => elements(h.render(ProfileScreen));
  let tree = render(), scroll = tree.find(node => node.type === 'UniversalScroll');
  assert.equal(scroll.props.style.flex, 1);
  assert.equal(scroll.props.bounces, true); assert.equal(scroll.props.alwaysBounceVertical, true); assert.equal(scroll.props.overScrollMode, 'always');
  assert.equal(scroll.props.refreshIndicatorOffset, 28);
  assert.equal(scroll.props.refreshEnabled, true); scroll.props.onRefresh(); assert.deepEqual(calls, ['identity', 'academic', 'summary', 'bell']);
  assert.ok(tree.some(node => node.props?.children === 'Carlos actualizado'));
  assert.equal(tree.some(node => node.type === countSkeleton), false);
  notifications.loading = true; tree = render(); assert.ok(tree.some(node => node.type === countSkeleton));
  assert.equal(tree.find(node => node.props?.accessibilityLabel === 'Notificaciones, actualizando contador').props.children[1].type, countSkeleton);
  notifications.loading = false;
  state.academicLoading = true; summary.loading = true; tree = render(); scroll = tree.find(node => node.type === 'UniversalScroll');
  assert.equal(scroll.props.refreshing, true); assert.equal(scroll.props.refreshEnabled, false); assert.ok(tree.some(node => node.type === academicSkeleton));
  assert.ok(tree.some(node => node.type === countSkeleton));
  assert.equal(tree.find(node => node.type === cards).props.loading, true);
  assert.equal(tree.some(node => node.type?.name === 'AcademicChip'), false);
  state.academicLoading = false; tree = render();
  assert.ok(tree.some(node => node.type === academicSkeleton)); assert.equal(tree.find(node => node.type === cards).props.loading, true);
  state.academicLoading = false; summary.loading = false; tree = render();
  assert.equal(tree.some(node => node.type === academicSkeleton), false); assert.equal(tree.find(node => node.type === cards).props.loading, false);
  assert.equal(tree.some(node => node.type === countSkeleton), false);
  notifications.unreadCount = 0; tree = render();
  assert.ok(tree.some(node => node.props?.accessibilityLabel === 'Notificaciones')); assert.equal(tree.some(node => node.type === countSkeleton), false);
  tree.find(node => node.props?.accessibilityLabel === 'Abrir opciones de cuenta').props.onPress();
  assert.equal(render().find(node => node.type === 'UniversalScroll').props.refreshEnabled, false);
});

test('each profile section stays in its modal and activity details receive no map navigation callback', () => {
  const h = hooks(), names = ['publications', 'requests', 'transactions', 'resources', 'activities'];
  const titles = Object.fromEntries(names.map(name => [name, name])); let section = 'activities', backs = 0;
  const history = () => null, detail = () => null, transaction = () => null, requests = () => null, acquired = () => null, activity = () => null;
  const { ProfilePersonalScreen } = load('components/ProfilePersonalScreen.tsx', {
    'react/jsx-runtime': jsx, react: h.react,
    'expo-router': { useLocalSearchParams: () => ({ section }), useRouter: () => ({ canGoBack: () => true, back() { backs++; } }) },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20 }) },
    'lucide-react-native': Object.fromEntries(['CalendarCheck', 'ChevronRight', 'MapPin', 'RefreshCw', 'X'].map(name => [name, () => null])),
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56', SECONDARY: '#3F6A8E' } },
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity: { userId: 'user', campusId: 'campus', capabilities: { general: true } } }) },
    '@/features/activities/components/ActivityDetail': { ActivityDetail: activity },
    '@/components/RefreshScrollView': { RefreshScrollView: 'Scroll' },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory': { PhysicalgoodsHistory: history, PhysicalgoodsHistoryDetail: detail },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsRequests': { PhysicalgoodsRequests: requests },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction': { PhysicalgoodsTransaction: transaction },
    '@/features/marketplace/elibrary/components/AcquiredDigitalResources': { AcquiredDigitalResources: acquired },
    './ProfilePersonalCards': { PERSONAL_TITLES: titles }, '../hooks/useOwnActivities': { useOwnActivities: () => { throw new Error('Unexpected preload'); } },
  });
  const root = ProfilePersonalScreen(); const render = () => h.render(() => root.type(root.props));
  let tree = elements(render());
  const list = tree.find(node => typeof node.type === 'function' && node.type.name === 'OwnActivities');
  assert.ok(list); assert.equal(tree.some(node => [history, requests, acquired].includes(node.type)), false);
  list.props.onSelect('123456789012345678901234'); tree = elements(render());
  const selected = tree.find(node => node.type === activity);
  assert.equal(selected.props.activityId, '123456789012345678901234'); assert.equal(selected.props.onExplore, undefined);
  selected.props.onBack(); assert.ok(elements(render()).some(node => node.type === list.type));
  tree.find(node => node.props?.accessibilityLabel === 'Cerrar consulta personal').props.onPress(); assert.equal(backs, 1);
  for (section of ['publications', 'requests', 'transactions', 'resources', 'invalid', ['activities']]) {
    const next = ProfilePersonalScreen(); tree = elements(h.render(() => next.type(next.props)));
    if (section === 'resources') assert.equal(tree.find(node => node.type === acquired).props.embedded, true);
    if (section === 'publications') assert.equal(tree.find(node => node.type === history).props.transactions, false);
    if (section === 'transactions') assert.equal(tree.find(node => node.type === history).props.transactions, true);
    if (section === 'requests') assert.equal(tree.find(node => node.type === requests).props.onOpen, undefined);
    assert.equal(tree.some(node => node.type === activity), false);
  }
});
