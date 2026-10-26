import { loadSafeArea } from './helpers/safe-area.mjs';
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
    if (name === '@/lib/layout/safeArea') return loadSafeArea(dependencies['react-native']?.Platform?.OS); assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name];
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
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
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

test('academic data survives identity renewal, reloads explicitly and isolates user/campus replies', async () => {
  const h = hooks(), requests = []; let identity = { userId: 'user-a', campusId: 'campus-a', capabilities: { general: true }, roles: [], profile: {} };
  const { useProfile } = load('hooks/useProfile.ts', { react: h.react, '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity, signOut: async () => {} }) },
    '../api/profileApi': { loadAcademicProfile: signal => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })) },
  });
  const render = () => h.render(useProfile);
  render(); assert.equal(render().academicLoading, true);
  requests[0].resolve({ fullName: 'Carlos', campusName: 'San Andrés', careers: [] }); await setImmediate();
  identity = { ...identity, roles: [], profile: { nombre_completo: 'Carlos' } };
  assert.equal(render().academicProfile.fullName, 'Carlos'); assert.equal(render().academicLoading, false);
  assert.equal(requests.length, 1);
  render().reloadAcademicProfile(); render(); assert.equal(render().academicLoading, true); assert.equal(render().academicProfile.fullName, 'Carlos');
  requests[1].reject(new Error('offline')); await setImmediate(); assert.equal(render().academicLoading, false);
  assert.equal(render().academicProfile.campusName, 'San Andrés'); assert.ok(render().academicError);
  render().reloadAcademicProfile(); render();
  requests.at(-1).resolve({ fullName: 'Carlos', campusName: 'Campus', careers: [{ id: 'new-career', nombre: 'Career' }] }); await setImmediate();
  assert.equal(render().academicProfile.careers[0].id, 'new-career'); assert.equal(render().academicError, null);
  render().reloadAcademicProfile(); render(); const old = requests.at(-1);
  identity = { ...identity, userId: 'user-b' }; assert.equal(render().academicProfile, null); assert.equal(old.signal.aborted, true);
  old.resolve({ fullName: 'Old' }); await setImmediate(); assert.equal(render().academicProfile, null);
  const otherUser = requests.at(-1);
  identity = { ...identity, campusId: 'campus-b' }; assert.equal(render().academicProfile, null); assert.equal(otherUser.signal.aborted, true);
  otherUser.resolve({ fullName: 'Previous campus' }); await setImmediate(); assert.equal(render().academicProfile, null);
  requests.at(-1).resolve({ fullName: 'New user', careers: [{ id: 'career', nombre: 'Career' }] }); await setImmediate();
  assert.equal(render().academicProfile.careers[0].id, 'career');
  identity = { ...identity, capabilities: { general: false } }; assert.equal(render().academicProfile, null);
  assert.equal(render().academicLoading, false);
  h.unmount(); assert.equal(requests.at(-1).signal.aborted, true);
});

test('academic editor invalidates the header only after a successful, non-cancelled save', async () => {
  const h = hooks(), calls = [], saves = [];
  const profile = { fullName: 'Carlos', campusId: 'campus', careers: [], updatedAt: 'revision' };
  const { useAcademicProfile } = load('hooks/useAcademicProfile.ts', { react: h.react,
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ refreshIdentity: () => calls.push('identity') }) },
    '@/lib/api/authenticated-request': { AuthApiError: class extends Error {} },
    '../api/profileApi': { loadAcademicProfile: async () => profile,
      loadAcademicOptions: async () => ({ campuses: [{ id: 'campus' }], careers: [{ id: 'career', campusIds: ['campus'] }] }),
      saveAcademicProfile: (input, signal) => new Promise((resolve, reject) => saves.push({ input, signal, resolve, reject })),
    },
  });
  const render = () => h.render(() => useAcademicProfile(() => calls.push('saved')));
  render(); await setImmediate(); render().setCareerIds(['career']);
  let pending = render().save(); assert.deepEqual(calls, []); assert.deepEqual(Array.from(saves[0].input.careerIds), ['career']);
  saves[0].resolve(); await pending; assert.deepEqual(calls, ['identity', 'saved']);
  calls.length = 0; pending = render().save(); saves[1].reject(new Error('offline')); await pending;
  assert.deepEqual(calls, []); assert.ok(render().error);
  pending = render().save(); h.unmount(); assert.equal(saves[2].signal.aborted, true);
  saves[2].resolve(); await pending; assert.deepEqual(calls, []);
});

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(4).flatMap(elements)];
}

test('profile refreshes cards and bell while keeping academic chips visible, with initial/loading/modal guards', () => {
  const h = hooks(), calls = [], state = { academicLoading: false, academicProfile: { fullName: 'Carlos actualizado', careers: [] }, closing: false };
  const summary = { loading: false, retry: () => calls.push('summary') };
  const identity = { userId: 'user', campusId: 'campus', capabilities: { general: true }, roles: [], profile: { nombre_completo: 'Carlos anterior' } };
  const academicSkeleton = () => null, countSkeleton = () => null, cards = () => null, account = () => null;
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
    '../hooks/useProfileOverview': { useProfileOverview: () => summary }, './ProfileAccountModal': { ProfileAccountModal: account },
    './ProfilePersonalCards': { ProfilePersonalCards: cards }, './ProfileSkeleton': { ProfileAcademicSkeleton: academicSkeleton, ProfileNotificationCountSkeleton: countSkeleton },
    '../types/access': { canManageAccess: () => false }, '@/features/analytics/types/access': { canAccessAnalytics: () => false },
  });
  const render = () => elements(h.render(ProfileScreen));
  let tree = render(), scroll = tree.find(node => node.type === 'UniversalScroll');
  assert.equal(scroll.props.style.flex, 1);
  assert.equal(scroll.props.bounces, true); assert.equal(scroll.props.alwaysBounceVertical, true); assert.equal(scroll.props.overScrollMode, 'always');
  assert.equal(scroll.props.refreshIndicatorOffset, 28);
  assert.equal(scroll.props.refreshEnabled, true); scroll.props.onRefresh(); assert.deepEqual(calls, ['identity', 'summary', 'bell']);
  assert.ok(tree.some(node => node.props?.children === 'Carlos actualizado'));
  assert.equal(tree.some(node => node.type === countSkeleton), false);
  notifications.loading = true; tree = render(); assert.ok(tree.some(node => node.type === countSkeleton));
  assert.equal(tree.find(node => node.props?.accessibilityLabel === 'Notificaciones, actualizando contador').props.children[1].type, countSkeleton);
  notifications.loading = false;
  state.academicLoading = true; summary.loading = true; tree = render(); scroll = tree.find(node => node.type === 'UniversalScroll');
  assert.equal(scroll.props.refreshing, true); assert.equal(scroll.props.refreshEnabled, false); assert.equal(tree.some(node => node.type === academicSkeleton), false);
  assert.ok(tree.some(node => node.type === countSkeleton));
  assert.equal(tree.find(node => node.type === cards).props.loading, true);
  assert.equal(tree.filter(node => node.type?.name === 'AcademicChip').length, 2);
  state.academicLoading = false; tree = render();
  assert.equal(tree.some(node => node.type === academicSkeleton), false); assert.equal(tree.find(node => node.type === cards).props.loading, true);
  const confirmed = state.academicProfile;
  state.academicProfile = null; state.academicLoading = true; tree = render();
  assert.ok(tree.some(node => node.type === academicSkeleton)); assert.equal(tree.some(node => node.type?.name === 'AcademicChip'), false);
  state.academicProfile = confirmed;
  state.academicLoading = false; summary.loading = false; tree = render();
  assert.equal(tree.some(node => node.type === academicSkeleton), false); assert.equal(tree.find(node => node.type === cards).props.loading, false);
  assert.equal(tree.some(node => node.type === countSkeleton), false);
  notifications.unreadCount = 0; tree = render();
  assert.ok(tree.some(node => node.props?.accessibilityLabel === 'Notificaciones')); assert.equal(tree.some(node => node.type === countSkeleton), false);
  tree.find(node => node.props?.accessibilityLabel === 'Abrir opciones de cuenta').props.onPress();
  tree = render(); assert.equal(tree.find(node => node.type === 'UniversalScroll').props.refreshEnabled, false);
  tree.find(node => node.type === account).props.onAcademicSaved(); assert.equal(calls.at(-1), 'academic');
});

test('personal sections retain their flows while enrolled activities only offer explicit map exploration', () => {
  const h = hooks(), names = ['publications', 'requests', 'transactions', 'resources', 'activities'];
  const titles = Object.fromEntries(names.map(name => [name, name])); let section = 'activities', backs = 0; const maps = [];
  const history = () => null, detail = () => null, transaction = () => null, requests = () => null, acquired = () => null, activity = () => null;
  const digitalPublications=()=>null,digitalRequests=()=>null,digitalTransactions=()=>null;
  const destinations=[],countsEnabled=[];
  let registration;
  const own = { result: null, page: 1, loading: false, error: 'offline', reload: () => backs++, setPage: () => {} };
  const { ProfilePersonalScreen } = load('components/ProfilePersonalScreen.tsx', {
    'react/jsx-runtime': jsx, react: h.react,
    'expo-router': { useLocalSearchParams: () => ({ section }), useRouter: () => ({ setParams:target=>destinations.push(target), canGoBack: () => true, back() { backs++; }, dismissTo(target) { maps.push(target); } }) },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20 }) },
    'lucide-react-native': Object.fromEntries(['CalendarCheck', 'MapPin', 'X'].map(name => [name, () => null])),
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56', SECONDARY: '#3F6A8E' } },
    '@/features/auth/hooks/useAuth': { useAuth: () => ({ identity: { userId: 'user', campusId: 'campus', capabilities: { general: true } } }) },
    '@/components/RefreshScrollView': { RefreshScrollView: 'Scroll', useScrollRefresh: (...args) => { registration = args; } },
    '@/components/navigation/BottomNavigationIcon':{BottomNavigationIcon:'NavigationIcon'},
    '@/features/marketplace/components/CatalogUI':{CatalogTabs:'DomainTabs'},
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsHistory': { PhysicalgoodsHistory: history, PhysicalgoodsHistoryDetail: detail },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsRequests': { PhysicalgoodsRequests: requests },
    '@/features/marketplace/physicalgoods/components/PhysicalgoodsTransaction': { PhysicalgoodsTransaction: transaction },
    '@/features/marketplace/elibrary/components/DigitalAcquiredActivity': { DigitalAcquiredActivity: acquired },
    '@/features/marketplace/elibrary/components/DigitalPublications': { DigitalPublications: digitalPublications },
    '@/features/marketplace/elibrary/components/DigitalActivityRequests': { DigitalActivityRequests: digitalRequests },
    '@/features/marketplace/elibrary/components/DigitalActivityTransactions': { DigitalActivityTransactions: digitalTransactions },
    '@/features/marketplace/elibrary/hooks/useDigitalActivity': { useDigitalActivityCounts:active=>{countsEnabled.push(active);return {counts:null,loading:false,reload(){}};} },
    './ProfilePersonalCards': { PERSONAL_TITLES: titles }, '../hooks/useOwnActivities': { useOwnActivities: () => own },
  });
  const root = ProfilePersonalScreen(); const render = () => h.render(() => root.type(root.props));
  let tree = elements(render());
  const list = tree.find(node => typeof node.type === 'function' && node.type.name === 'OwnActivities');
  assert.ok(list); assert.equal(tree.some(node => [history, requests, acquired].includes(node.type)), false);
  list.type(list.props); assert.equal(registration[0], own.reload); assert.equal(registration[2], true);
  assert.equal(elements(list.type(list.props)).some(node => node.props?.accessibilityLabel === 'Actualizar mis actividades'), false);
  for (const total of [0, 1, 4, 5, 11]) {
    own.result = { total, items: [], hasMore: total > 10 };
    const content = elements(list.type(list.props));
    assert.equal(content.some(node => node.props?.accessibilityLabel === 'Actividades anteriores'), total >= 5);
    assert.equal(content.some(node => node.props?.accessibilityLabel === 'Actividades siguientes'), total >= 5);
  }
  const items = ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'].map((type, i) => ({ id: String(i + 1).repeat(24), type, title: `Actividad ${i + 1}`,
    startAt: '2099-10-21T18:00:00Z', location: { buildingName: 'Cabaña A', floorName: 'Piso -1' } }));
  own.result = { total: 2, items, hasMore: false };
  const cards = elements(list.type(list.props)), buttons = cards.filter(node => node.type === 'Button');
  assert.equal(cards.some(node => node.props?.children === 'Inscrito'), false);
  assert.equal(cards.some(node => node.props?.accessibilityLabel?.startsWith('Ver actividad')), false);
  assert.equal(list.props.onSelect, undefined); assert.equal(maps.length, 0);
  assert.equal(buttons.length, items.length);
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.props.accessibilityLabel, `Explorar ${items[index].title} en el mapa`);
    assert.ok(elements(button).some(node => node.props?.children === 'Explorar actividad en el mapa'));
    button.props.onPress(); assert.equal(maps[index].pathname, '/map'); assert.equal(maps[index].params.activityId, items[index].id);
    assert.ok(elements(render()).some(node => node.type === list.type));
  }
  own.loading = true; const pending = elements(list.type(list.props)); assert.equal(registration[1], true); assert.equal(registration[2], false);
  assert.ok(pending.filter(node => node.type === 'Button').every(node => node.props.disabled));
  own.result = null; own.loading = false; tree = elements(render());
  tree.find(node => node.props?.accessibilityLabel === 'Cerrar consulta personal').props.onPress(); assert.equal(backs, 1);
  for (section of ['publications', 'requests', 'transactions', 'resources', 'invalid', ['activities']]) {
    const next = ProfilePersonalScreen(); tree = elements(h.render(() => next.type(next.props)));
    if (section === 'resources') assert.equal(tree.find(node => node.type === acquired).props.active, true);
    if (section === 'publications') assert.equal(tree.find(node => node.type === history).props.transactions, false);
    if (section === 'transactions') assert.equal(tree.find(node => node.type === history).props.transactions, true);
    if (section === 'requests') assert.equal(tree.find(node => node.type === requests).props.onOpen, undefined);
    if(['publications','requests','transactions'].includes(section)){
      const domainTabs=tree.find(node=>node.type==='DomainTabs');
      assert.equal(domainTabs.props.variant,'underline');assert.equal(domainTabs.props.tabs[0].label,'Mercado');assert.equal(domainTabs.props.tabs[1].label,'Biblioteca');
      assert.equal(domainTabs.props.tabs[0].icon.props.id,'physicalgoods');assert.equal(domainTabs.props.tabs[1].icon.props.id,'elibrary');
      domainTabs.props.onSelect('digital');
      tree=elements(h.render(()=>next.type(next.props)));
      const component={publications:digitalPublications,requests:digitalRequests,transactions:digitalTransactions}[section];
      assert.ok(tree.some(node=>node.type===component));assert.ok(!tree.some(node=>node.type===history||node.type===requests));
      assert.equal(countsEnabled.at(-1),section==='requests');
      if(section==='publications'){tree.find(node=>node.type===component).props.onRequests();assert.deepEqual(JSON.parse(JSON.stringify(destinations.at(-1))),{section:'requests',kind:'digital'});}
      if(section==='transactions'){tree.find(node=>node.type===component).props.onAcquired('acquired-id');assert.deepEqual(JSON.parse(JSON.stringify(destinations.at(-1))),{section:'resources',publicationId:'acquired-id'});}
      tree.find(node=>node.type==='DomainTabs').props.onSelect('physical');
    }
    assert.equal(tree.some(node => node.type === activity), false);
  }
});

test('personal modal lists register their own queries and protect confirmation and download state', () => {
  let registered;
  const scroll = { useScrollRefresh: (onRefresh, refreshing, enabled) => { registered = { onRefresh, refreshing, enabled }; } };
  const native = { View: 'View', Text: 'Text', Pressable: 'Button', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
  const shared = { 'react/jsx-runtime': jsx,react:{useCallback:fn=>fn}, 'react-native': native, '@/components/RefreshScrollView': scroll,
    '../../components/ActivityUI': { activityUI: {}, ActivityHeader: 'Header', ActivityFeedback: 'Feedback', ActivityPager: 'Pager', ActivityAction: 'Action' },
    '../utils/requestTerms':{},'./PhysicalgoodsPriceHistory':{},
    '../../components/ResourceDetailUI': { detailUI: {} }, '../../components/CatalogUI': { CATALOG_COLORS: {} }, 'lucide-react-native': {} };
  const reload = () => {}, history = { reload, loading: false, page: null, number: 1 };
  const { PhysicalgoodsHistory } = load('../marketplace/physicalgoods/components/PhysicalgoodsHistory.tsx', { ...shared,react:{useCallback:fn=>fn},'./PhysicalgoodsAgreements':{PhysicalgoodsAgreements:'Agreements'},'./PhysicalgoodsPublications':{PhysicalgoodsPublications:'Publications'},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})}, '../../components/PersonalUI':{PersonalStatus:'Status'}, '../../components/RequestFlowUI':{RequestTimeline:'Timeline'},
    '../hooks/usePhysicalgoodsHistory': { usePhysicalgoodsHistory: () => history }, '../types/publication': { resourceConditions: [] } });
  const renderPublications=(props)=>PhysicalgoodsHistory(props);
  for (const transactions of [false]) {
    let panel=renderPublications({ active: true, transactions, refreshVersion: 0 });assert.equal(panel.type,'Publications');assert.equal(panel.props.active,true);
    panel=renderPublications({ active: true, transactions, refreshVersion: 0, refreshEnabled: false });assert.equal(panel.props.refreshEnabled,false);
  }
  const requests = { reload, loading: false, busy: false, selection: null, page: null, number: 1 };
  const { PhysicalgoodsRequests } = load('../marketplace/physicalgoods/components/PhysicalgoodsRequests.tsx', { ...shared,
    react:{useCallback:fn=>fn},
    '../hooks/usePhysicalgoodsRequestCounts':{usePhysicalgoodsRequestCounts:()=>({counts:{sentAccepted:0,receivedPending:0},loading:false,reload})},
    './PhysicalgoodsSentRequests':{PhysicalgoodsSentRequests:'SentRequests'},
    './PhysicalgoodsReceivedRequests':{PhysicalgoodsReceivedRequests:'ReceivedRequests'},
    '../hooks/usePhysicalgoodsRequests': { usePhysicalgoodsRequests: () => requests },
    '../utils/receivedRequestIndicators':load('../marketplace/physicalgoods/utils/receivedRequestIndicators.ts',{}),
    '../../components/CatalogUI': { StatusTag: 'Status' }, '../../components/ResourceDetailUI': { detailUI: {} },
    '../../components/RequestsUI': { requestUI: {}, RequestsHeader: 'Header', RequestsFeedback: 'Feedback', RequestsPager: 'Pager', RequestDecisionDialog: 'Dialog' } });
  for (const received of [false, true]) {
    PhysicalgoodsRequests({ active: true, received }); assert.equal(typeof registered.onRefresh,'function'); assert.equal(registered.enabled, true);
    requests.busy = true; PhysicalgoodsRequests({ active: true, received }); assert.equal(registered.enabled, false); requests.busy = false;
    requests.selection = { decision: 'ACEPTAR', request: { requester: {}, publication: {} } };
    PhysicalgoodsRequests({ active: true, received }); assert.equal(registered.enabled, false); requests.selection = null;
  }
  const resources = { open: true, loading: false, downloading: null, items: [], page: 1, refresh: reload };
  const { AcquiredDigitalResources } = load('../marketplace/elibrary/components/AcquiredDigitalResources.tsx', { ...shared,
    react: { useEffect() {} },
    '@/types/colors': { APP_COLORS: {} }, '../hooks/useAcquiredDigitalResources': { useAcquiredDigitalResources: () => resources } });
  AcquiredDigitalResources({ embedded: true }); assert.equal(registered.onRefresh, reload); assert.equal(registered.enabled, true);
  resources.downloading = 'file'; AcquiredDigitalResources({ embedded: true }); assert.equal(registered.enabled, false);
});

test('nested history/agreement modals use universal refresh and wait for their data without interrupting confirmations', () => {
  const native = { Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
  const shared = { 'react/jsx-runtime': jsx, 'react-native': native, '@/components/RefreshScrollView': { RefreshScrollView: 'UniversalScroll' },
    '../utils/requestTerms':{},'./PhysicalgoodsPriceHistory':{},
    '../../components/ActivityUI': {}, '../../components/ResourceDetailUI': { detailUI: {}, ResourceDetailSkeleton: 'Skeleton' }, '../../components/CatalogUI': { CATALOG_COLORS: {} } };
  const reload = () => {}, history = { detail: null, reload, loading: false };
  const { PhysicalgoodsHistoryDetail } = load('../marketplace/physicalgoods/components/PhysicalgoodsHistory.tsx', { ...shared,react:{useCallback:fn=>fn},'./PhysicalgoodsAgreements':{PhysicalgoodsAgreements:'Agreements'},'./PhysicalgoodsPublications':{PhysicalgoodsPublications:'Publications'},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})}, '../../components/PersonalUI':{PersonalStatus:'Status'}, '../../components/RequestFlowUI':{RequestTimeline:'Timeline'},
    '../hooks/usePhysicalgoodsHistory': { usePhysicalgoodsHistoryDetail: () => history }, '../types/publication': { resourceConditions: [] } });
  const renderHistory = (refreshEnabled = true) => elements(PhysicalgoodsHistoryDetail({ target: { publicationId: 'publication' }, refreshEnabled })).find(node => node.type === 'UniversalScroll');
  assert.equal(renderHistory().props.onRefresh, reload); assert.equal(renderHistory().props.refreshEnabled, true);
  history.loading = true; assert.equal(renderHistory().props.refreshing, true); assert.equal(renderHistory().props.refreshEnabled, false);
  history.loading = false; assert.equal(renderHistory(false).props.refreshEnabled, false);
  const h = hooks(), agreement = { detail: null, reload, busy: false, loading: false, messagesLoading: false, optionsLoading: false, action: null, ratingConfirmation: false };
  const { PhysicalgoodsTransaction } = load('../marketplace/physicalgoods/components/PhysicalgoodsTransaction.tsx', { ...shared, react: h.react,
    '../hooks/usePhysicalgoodsTransaction': { usePhysicalgoodsTransaction: () => agreement },
    '../hooks/usePhysicalgoodsAgreementRequest':{usePhysicalgoodsAgreementRequest:()=>({request:null,loading:false,error:null})},
    './PhysicalgoodsAgreementProduct':{PhysicalgoodsAgreementProduct:'ProductModal'}, '../../components/AgreementStepModal':{AgreementStepModal:'StepModal'},
    '../../components/AgreementUI':{AgreementHeader:'Header',AgreementMenu:'Menu'}, '../../utils/agreementPresentation':{agreementCopy:{},agreementPresentation:()=>({})}, './PhysicalgoodsHistory':{},
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) },
    '../../components/RequestsUI': { RequestButton: 'Button' },
    '../../components/TransactionUI': { transactionUI: {}, TransactionHeader: 'Header', TransactionFeedback: 'Feedback', TransactionDecisionDialog: 'Dialog' },
    './PhysicalgoodsCoordination': {}, '../../components/OwnerRating': {}, '../../components/TransactionRating': {}, 'lucide-react-native': { CheckCircle2: 'SuccessIcon' }, '../../hooks/useAgreementPolling': { useAgreementPolling() {} }, '../../components/MarketplaceReportForm': { MarketplaceReportForm: () => null } });
  const render = (refreshEnabled = true) => elements(h.render(() => PhysicalgoodsTransaction({ target: {}, refreshEnabled }))).find(node => node.type === 'UniversalScroll');
  assert.equal(render().props.onRefresh, reload); assert.equal(render().props.refreshEnabled, true);
  assert.equal(render().props.refreshIndicatorOffset, 67);
  assert.equal(render(false).props.refreshEnabled, false);
  for (const key of ['loading', 'messagesLoading', 'optionsLoading']) { agreement[key] = true;
    assert.equal(render().props.refreshing, true); assert.equal(render().props.refreshEnabled, false); agreement[key] = false; }
  for (const key of ['busy', 'action', 'ratingConfirmation']) { agreement[key] = true;
    assert.equal(render().props.refreshEnabled, false); agreement[key] = false; }
});

test('acquired resource refresh reloads the visible detail without returning to the list and cancels obsolete replies', async () => {
  const h = hooks(), requests = [], lists = [];
  const { useAcquiredDigitalResources } = load('../marketplace/elibrary/hooks/useAcquiredDigitalResources.ts', { react: h.react,
    '../api/elibraryApi': { loadAcquiredDigitalResources: (page, signal) => new Promise((resolve, reject) => lists.push({ page, signal, resolve, reject })),
      loadAcquiredDigitalResource: (id, signal) => new Promise((resolve, reject) => requests.push({ id, signal, resolve, reject })) },
    '../api/saveDigitalFile': {},
  });
  const render = () => h.render(() => useAcquiredDigitalResources(true));
  render(); assert.equal(render().loading, true); lists[0].resolve({ data: [{ id: 'one' }], meta: { hasMore: false } }); await setImmediate();
  const stable = render().refresh; assert.equal(render().refresh, stable); stable(); render();
  assert.equal(lists.length, 2); assert.equal(render().loading, true); lists[1].reject(new Error('offline')); await setImmediate();
  assert.equal(render().loading, false); assert.ok(render().error);
  let pending = render().show('one'); requests[0].resolve({ id: 'one', title: 'Original' }); await pending;
  render().refresh(); assert.equal(render().loading, true); assert.equal(requests[1].id, 'one'); assert.equal(lists.length, 2);
  requests[1].resolve({ id: 'one', title: 'Updated' }); await setImmediate(); assert.equal(render().detail.title, 'Updated');
  render().refresh(); requests[2].reject(new Error('offline')); await setImmediate();
  assert.equal(render().loading, false); assert.equal(render().detail.id, 'one'); assert.ok(render().error);
  render().refresh(); pending = render().show('two'); assert.equal(requests[3].signal.aborted, true);
  requests[3].resolve({ id: 'one', title: 'Obsolete' }); requests[4].resolve({ id: 'two', title: 'Second' }); await pending;
  assert.equal(render().detail.id, 'two'); render().refresh(); h.unmount(); assert.equal(requests.at(-1).signal.aborted, true);
  requests.at(-1).resolve({ id: 'two', title: 'After close' }); await setImmediate(); assert.equal(render().detail.title, 'Second');
});
