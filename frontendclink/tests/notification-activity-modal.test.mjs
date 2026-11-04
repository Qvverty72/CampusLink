import { loadSafeArea } from './helpers/safe-area.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, dependencies) {
  const source = fs.readFileSync(new URL('../src/features/' + file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, AbortController, require(name) {
    if (name === '@/lib/layout/safeArea') return loadSafeArea(dependencies['react-native']?.Platform?.OS); assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name];
  } });
  return module.exports;
}
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial,
      set(value) { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; } }; return [slots[i].value, slots[i].set]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, render(fn) { cursor = 0; effects = []; const result = fn(); effects.forEach(fn => fn()); return result; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(4).flatMap(elements)];
class AuthApiError extends Error { constructor(status) { super('API'); this.status = status; } }
const activityId = '1234567890abcdef12345678';
const detail = { id: activityId, campusId: 'campus-a', title: 'Taller de fotografía', description: 'Descripción original del backend',
  type: 'OFFICIAL_EVENT', status: 'ACTIVE', startAt: '2099-10-23T12:00:00Z', endAt: '2099-10-23T14:00:00Z',
  organizer: { name: 'Carlos' }, participantCount: 8, category: 'Taller', tags: ['Fotografía'],
  location: { buildingKey: 'building-a', floorKey: 'floor-a', buildingName: 'Edificio A', floorName: 'Piso -1', poiName: 'Sala 2' },
  participation: { status: 'NOT_JOINED', canJoin: true, canLeave: false } };
const native = { ActivityIndicator: 'Spinner', Modal: 'Modal', ScrollView: 'Scroll', View: 'View', Text: 'Text', TouchableOpacity: 'Button', Pressable: 'Button', StyleSheet: { create: value => value } };
function fixture() {
  const h = hooks(), calls = [], changes = [], explored = []; let closed = 0, type = 'OFFICIAL_EVENT_PUBLISHED', notificationId = '11111111-1111-4111-8111-111111111111';
  const auth = { identity: { userId: 'user-a', campusId: 'campus-a' }, refreshIdentity() {} };
  const { useActivityPreview } = load('activities/hooks/useActivityPreview.ts', { react: h.react,
    '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../api/activitiesApi': { fetchActivityDetail: (...args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject })) },
  });
  const { useNotificationActivityChange } = load('users/hooks/useNotificationActivityChange.ts', { react: h.react,
    '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/lib/api/authenticated-request': { AuthApiError },
    '../api/notificationsApi': { fetchNotificationActivityChange: (...args) => new Promise((resolve, reject) => changes.push({ args, resolve, reject })) },
  });
  const { NotificationActivityModal } = load('users/components/NotificationActivityModal.tsx', {
    'react/jsx-runtime': jsx, 'react-native': native,
    'lucide-react-native': Object.fromEntries(['ArrowRight', 'CalendarDays', 'MapPin', 'X'].map(name => [name, () => null])),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) },
    '@/features/activities/hooks/useActivityPreview': { useActivityPreview },
    '../hooks/useNotificationActivityChange': { useNotificationActivityChange },
    '@/components/Skeleton': { Skeleton: 'Skeleton', SkeletonBlock: 'Block' },
    '@/types/colors': { APP_COLORS: { PRIMARY: '#002E56', SECONDARY: '#3F6A8E' } },
  });
  const render = () => elements(h.render(() => NotificationActivityModal({ activityId, notificationId, notificationType: type, onClose: () => closed++, onExplore: id => explored.push(id) })));
  return { render, calls, changes, explored, auth, unmount: h.unmount, closed: () => closed, setType(value) { type = value; }, setNotice(id) { notificationId = id; } };
}

test('notification preview is read-only, compact, and offers a single map action after loading', async () => {
  const f = fixture(); let tree = f.render();
  assert.equal(f.calls.length, 1); assert.ok(tree.some(node => node.type === 'Skeleton'));
  assert.equal(tree.some(node => node.props?.accessibilityLabel === 'Explorar actividad en el mapa'), false);
  f.calls[0].resolve(detail); await setImmediate(); tree = f.render();
  assert.ok(tree.some(node => node.props?.children === 'Publicación de evento oficial'));
  assert.ok(tree.some(node => node.props?.children === detail.title)); assert.ok(tree.some(node => node.props?.children === detail.location.buildingName));
  assert.equal(tree.find(node => node.props?.children === detail.description).props.numberOfLines, 2);
  for (const text of ['En curso', 'Próximamente', 'Finalizado', 'Inscribirme', 'Retirarme', 'Denunciar actividad', 'Eliminar actividad', 'Tu participación']) assert.equal(tree.some(node => node.props?.children === text), false);
  assert.equal(tree.find(node => node.type === 'Scroll').props.onRefresh, undefined);
  assert.equal(tree.find(node => node.type === 'Scroll').props.refreshControl, undefined);
  tree.find(node => node.props?.accessibilityLabel === 'Explorar actividad en el mapa').props.onPress(); assert.deepEqual(f.explored, [activityId]);
  assert.equal(f.calls.length, 1); tree.find(node => node.props?.accessibilityLabel === 'Volver a notificaciones').props.onPress(); assert.equal(f.closed(), 1); f.unmount();
});

test('preview header reflects the pressed notification type, including multiple notices about one activity', async () => {
  const f = fixture(); f.render(); f.calls[0].resolve(detail); await setImmediate();
  for (const [type, title] of Object.entries({ OFFICIAL_EVENT_PUBLISHED: 'Publicación de evento oficial', OFFICIAL_EVENT_STARTED: 'Inicio de evento oficial', ACTIVITY_CHANGED: 'Actividad modificada' })) {
    f.setType(type); assert.ok(f.render().some(node => node.props?.children === title));
  }
  assert.equal(f.calls.length, 1); f.unmount();
});

const change = { notificationId: '11111111-1111-4111-8111-111111111111', activityId, title: 'Prueba denuncia',
  before: { title: 'Prueba denuncia', description: 'Descripción', startAt: '2099-10-21T18:00:00Z', endAt: '2099-10-21T20:00:00Z',
    location: { buildingKey: 'a', floorKey: 'a1', buildingName: 'Cabaña A', floorName: 'Piso 1' } },
  after: { title: 'Prueba denuncia', description: 'Descripción', startAt: '2099-10-22T19:00:00Z', endAt: '2099-10-22T21:00:00Z',
    location: { buildingKey: 'b', floorKey: 'b1', buildingName: 'Cabaña B', floorName: 'Piso 1' } } };

test('edited notice loads only its own snapshots, compares before/after and keeps the map action', async () => {
  const f = fixture(); f.setType('ACTIVITY_CHANGED'); let tree = f.render();
  assert.equal(f.calls.length, 0); assert.equal(f.changes[0].args[0], change.notificationId);
  assert.ok(tree.some(node => node.type === 'Skeleton')); assert.equal(tree.some(node => node.type === 'Spinner'), false);
  f.changes[0].resolve(change); await setImmediate(); tree = f.render();
  for (const text of ['Actividad modificada', 'ANTES', 'AHORA', change.title, 'Cabaña A · Piso 1', 'Cabaña B · Piso 1']) assert.ok(tree.some(node => node.props?.children === text), text);
  const old = tree.find(node => node.props?.children === 'Cabaña A · Piso 1');
  assert.ok(old.props.style.some(style => style?.textDecorationLine === 'line-through'));
  const current = tree.find(node => node.props?.children === 'Cabaña B · Piso 1');
  assert.ok(current.props.style.some(style => style?.fontWeight === '700'));
  tree.find(node => node.props?.accessibilityLabel === 'Explorar actividad en el mapa').props.onPress(); assert.deepEqual(f.explored, [activityId]);
  assert.equal(tree.find(node => node.type === 'Scroll').props.onRefresh, undefined);
  assert.equal(tree.find(node => node.type === 'Scroll').props.refreshControl, undefined);
  assert.equal(f.changes.length, 1);
  f.unmount(); assert.equal(f.changes[0].args[1].aborted, true);
});

test('separate edits of the same activity never display stale snapshots; missing history is recoverable', async () => {
  const f = fixture(); f.setType('ACTIVITY_CHANGED'); f.render(); const first = f.changes[0];
  f.setNotice('22222222-2222-4222-8222-222222222222'); f.render(); assert.equal(first.args[1].aborted, true);
  first.resolve(change); await setImmediate(); assert.equal(f.render().some(node => node.props?.children === change.title), false);
  f.changes[1].reject(new AuthApiError(404)); await setImmediate(); let tree = f.render();
  assert.ok(tree.some(node => node.props?.children === 'El cambio de esta actividad ya no está disponible.'));
  assert.equal(tree.some(node => node.props?.accessibilityLabel === 'Explorar actividad en el mapa'), false);
  tree.find(node => node.type === 'Button' && node.props.children?.props?.children === 'Reintentar').props.onPress(); f.render();
  f.auth.identity = { ...f.auth.identity, campusId: 'campus-b' }; f.render(); assert.equal(f.changes[2].args[1].aborted, true);
  f.changes[3].resolve({ ...change, activityId: 'abcdefabcdefabcdefabcdef' }); await setImmediate(); tree = f.render();
  assert.ok(tree.some(node => node.props?.children === 'No se pudo cargar el cambio. Reintenta.')); f.unmount();
});

test('content-only edits show the actual changed content and do not strike through unchanged metadata', async () => {
  const f = fixture(); f.setType('ACTIVITY_CHANGED'); f.render();
  f.changes[0].resolve({ ...change, before: { ...change.after, title: 'Nombre anterior', description: 'Antes' }, after: { ...change.after, description: 'Ahora' } });
  await setImmediate(); const tree = f.render();
  for (const text of ['Título', 'Descripción', 'Nombre anterior', 'Antes', 'Ahora']) assert.ok(tree.some(node => node.props?.children === text));
  const place = tree.filter(node => node.props?.children === 'Cabaña B · Piso 1');
  assert.equal(place.length, 2); assert.ok(place.every(node => !node.props.style.some(style => style?.textDecorationLine === 'line-through'))); f.unmount();
});

test('preview retry/404 and scope cancellation never perform participation lookups or expose stale data', async () => {
  const f = fixture(); f.render(); f.calls[0].reject(new AuthApiError(404)); await setImmediate();
  let tree = f.render(); assert.ok(tree.some(node => node.props?.children === 'Esta actividad ya no está disponible.'));
  assert.equal(tree.some(node => node.props?.accessibilityLabel === 'Explorar actividad en el mapa'), false);
  tree.find(node => node.type === 'Button' && node.props.children?.props?.children === 'Reintentar').props.onPress(); f.render(); const old = f.calls[1];
  f.auth.identity = { ...f.auth.identity, campusId: 'campus-b' }; f.render(); assert.equal(old.args[2].aborted, true);
  old.resolve(detail); await setImmediate(); assert.equal(f.render().some(node => node.props?.children === detail.title), false);
  f.unmount(); assert.equal(f.calls.at(-1).args[2].aborted, true);
});

function mapFixture() {
  const h = hooks(), calls = [], params = { activityId };
  const floorModal = () => null, floor = { id: 'floor-a', buildingId: 'building-a', meshName: 'glb_floor_minus_1' };
  const auth = { identity: { campusId: 'campus-a', userId: 'user-a' }, session: { access_token: 'test' }, refreshIdentity() {} };
  const map = { data: null, error: null, async loadMap() {}, clearMap() {} };
  const target = { detail, isLoading: false, error: null, refresh: () => calls.push(['retry']) };
  const selection = { selectedFloor: null, resetBuilding() { calls.push(['reset']); }, selectBuilding(id) { calls.push(['building', id]); }, selectFloor(id) { calls.push(['floor', id]); selection.selectedFloor = id; } };
  const store = Object.assign(selector => selector(selection), { getState: () => selection });
  const router = { setParams(value) { calls.push(['params', value]); Object.assign(params, value); } };
  const activities = { refresh() {}, activities: [] };
  const { default: MapScreen } = load('../../app/(map)/map.tsx', { react: h.react, 'react/jsx-runtime': jsx, 'react-native': native,
    'expo-router': { useLocalSearchParams: () => params, useRouter: () => router },
    '@/three/components/CampusMapViewport': { CampusMapViewport: () => null }, '@/features/activities/components/FloorInfoModal': { FloorInfoModal: floorModal },
    '@/three/store/mapDataStore': { useMapDataStore: selector => selector(map) }, '@/components/navigation/BottomNavigationBar': { BottomNavigationBar: () => null },
    '@/features/auth/hooks/useAuth': { useAuth: () => auth }, '@/three/store/mapStore': { useMapStore: store }, '@/three/api/mapApi': { ApiClientError: AuthApiError },
    '@/features/activities/hooks/useLocationActivities': { useLocationActivities: () => activities },
    '@/features/activities/hooks/useActivityPreview': { useActivityPreview: (_id, enabled) => enabled ? target : { detail: null, isLoading: false, error: null, refresh() {} } },
  });
  return { render: () => elements(h.render(MapScreen)), map, target, params, calls, floor, floorModal, selection, unmount: h.unmount };
}

test('map target waits for the current map and opens only the activity building/floor without forcing its detail', () => {
  const f = mapFixture(); f.render(); assert.equal(f.calls.some(call => call[0] === 'building'), false);
  f.map.data = { campusId: 'campus-a', floorData: { glb_floor_minus_1: f.floor } };
  f.target.detail = null; f.target.isLoading = true; const loading = f.render();
  assert.equal(f.calls.some(call => call[0] === 'building'), false);
  assert.equal(loading.some(node => node.type === 'Spinner'), false);
  for (const text of ['Abriendo actividad en el mapa…', 'Continuar en el mapa']) assert.equal(loading.some(node => node.props?.children === text), false);
  f.target.detail = detail; f.target.isLoading = false; f.render(); const tree = f.render();
  assert.ok(f.calls.some(call => call[0] === 'building' && call[1] === 'building-a'));
  assert.ok(f.calls.some(call => call[0] === 'floor' && call[1] === 'glb_floor_minus_1'));
  assert.equal(f.selection.selectedFloor, f.floor.meshName);
  assert.equal(tree.find(node => node.type === f.floorModal).props.activityId, undefined);
  assert.equal(tree.find(node => node.type === f.floorModal).props.onActivityBack, undefined);
  assert.equal(f.params.activityId, undefined);
  f.selection.selectedFloor = 'another-floor'; assert.equal(f.render().find(node => node.type === f.floorModal).props.activityId, undefined);
  f.selection.selectedFloor = f.floor.meshName; assert.equal(f.render().find(node => node.type === f.floorModal).props.activityId, undefined);
  f.unmount();
});

test('map link failure never invents a floor and offers retry or ordinary map navigation', () => {
  const f = mapFixture(); f.map.data = { campusId: 'campus-a', floorData: {} }; f.render(); let tree = f.render();
  assert.equal(f.calls.some(call => call[0] === 'building'), false); assert.ok(tree.some(node => node.props?.accessibilityRole === 'alert'));
  tree.find(node => node.type === 'Button' && node.props.children?.props?.children === 'Reintentar').props.onPress(); assert.ok(f.calls.some(call => call[0] === 'retry'));
  tree.find(node => node.type === 'Button' && node.props.children?.props?.children === 'Continuar en el mapa').props.onPress(); assert.equal(f.params.activityId, undefined); f.unmount();
});
