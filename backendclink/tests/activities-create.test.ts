import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, MongoClient } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivityParticipationDocument, CreateActivityInput } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { parseCreateActivity } from '../src/modules/activities/activities.create.validation.js';
import { toVisibleActivity } from '../src/modules/activities/activities.policy.js';
import { spatialBuildings } from '../src/modules/activities/activities.location.js';
import { localActivityTimestamp, validateActivityDraft } from '../../frontendclink/src/features/activities/types/creation.js';

const campusId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2099-10-10T12:00:00Z');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Organizador', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} };
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'hbuilding', name: 'Edificio H', floors: [
    { id: 'floor-two', meshName: 'hbuilding_floor2', name: 'Piso 2', pois: [
      { poiKey: 'sala', name: 'Sala', isVisible: true }, { poiKey: 'hidden', name: 'Oculto', isVisible: false },
      { poiKey: 'deleted', name: 'Eliminado', isVisible: true, deletedAt: now },
    ] }, { id: 'floor-one', meshName: 'hbuilding_floor1', name: 'Piso 1', pois: [{ poiKey: 'other-floor', name: 'Otro', isVisible: true }] },
  ] }] };
const body = () => ({ title: ' Taller ', description: ' Actividad\ncomunitaria ',
  startAt: '2099-10-11T12:00:00.000Z', endAt: '2099-10-11T13:00:00.000Z',
  location: { buildingKey: 'hbuilding', floorKey: 'floor-two' } });
function parsed(input: unknown = body()): CreateActivityInput {
  const result = parseCreateActivity(input); assert.equal(result.success, true);
  return (result as { data: CreateActivityInput }).data;
}
let createCommunityActivity: typeof import('../src/modules/activities/activities.create.service.js').createCommunityActivity;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://creation-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  ({ createCommunityActivity } = await import('../src/modules/activities/activities.create.service.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('creation parses UTC dates into BSON-compatible Dates and trims required/optional text', () => {
  const input = parsed({ ...body(), location: { ...body().location, poiKey: 'sala', customLabel: ' Junto a la entrada ' } });
  assert.equal(input.title, 'Taller'); assert.equal(input.description, 'Actividad\ncomunitaria');
  assert.equal(input.location.customLabel, 'Junto a la entrada');
  assert.equal(input.startAt.toISOString(), body().startAt);
  assert.equal(parsed({ ...body(), startAt: '2099-10-11T12:00:00Z' }).startAt.toISOString(), body().startAt);
});

test('creation rejects protected fields and malformed or incomplete location objects', () => {
  for (const input of [null, [], 'activity', {}, ...['campusId', 'createdByUserId', 'type', 'status', 'visibility', 'participantCount', 'bannerUrl']
    .map(key => ({ ...body(), [key]: key === 'type' ? 'OFFICIAL_EVENT' : 'override' })),
    { ...body(), location: { buildingKey: 'hbuilding' } }, { ...body(), location: { ...body().location, coordinates: { x: 1, y: 0, z: 1 } } },
    { ...body(), location: { ...body().location, poiKey: { $ne: '' } } }, { ...body(), location: [] },
    { ...body(), location: { ...body().location, poiKey: null } }]) {
    assert.equal(parseCreateActivity(input).success, false);
  }
});

test('creation limits content and rejects controls, missing text and normalized invalid calendar values', () => {
  for (const patch of [{ title: '' }, { title: ' '.repeat(5) }, { title: 'x'.repeat(121) }, { title: 'Hello\nworld' },
    { description: 'x'.repeat(2001) }, { description: '\u0000' }, { description: 123 },
    { location: { ...body().location, customLabel: 'x'.repeat(161) } },
    { startAt: '2099-02-30T12:00:00.000Z' }, { startAt: '2099-10-11' },
    { startAt: '2099-10-11T24:00:00.000Z' }, { endAt: body().startAt }, { endAt: '2099-10-10T12:00:00.000Z' }]) {
    assert.equal(parseCreateActivity({ ...body(), ...patch }).success, false);
  }
  assert.equal(parseCreateActivity({ ...body(), title: 'x'.repeat(120), description: 'x'.repeat(2000) }).success, true);
});

test('creation derives all protected fields, enrolls organizer and permits future or ongoing activities', async () => {
  for (const startAt of ['2099-10-11T12:00:00.000Z', '2099-10-09T12:00:00.000Z']) {
    let writes = 0;
    const detail = await createCommunityActivity(auth, parsed({ ...body(), startAt }), {
      getActiveMap: async () => map, now: () => now, createActivity: async document => {
        writes++; assert.equal(document.campusId, campusId); assert.equal(document.createdByUserId, userId);
        assert.equal(document.type, 'COMMUNITY_ACTIVITY'); assert.equal(document.status, 'ACTIVE');
        assert.equal(document.visibility, 'PUBLIC'); assert.equal(document.participantCount, 1);
        assert.equal(document.createdAt, now); assert.equal(document.updatedAt, now);
        return toVisibleActivity(document, campusId, now, spatialBuildings(map))!;
      },
    });
    assert.equal(writes, 1); assert.deepEqual(detail.participation, { status: 'JOINED', canJoin: false });
    assert.deepEqual(detail.organizer, { name: 'Organizador' }); assert.equal(detail.location.floorName, 'Piso 2');
  }
});

test('creation refuses unverified, suspended, deleted and mismatched profile accounts before persistence', async () => {
  let writes = 0;
  for (const patch of [{ verificado_en: null }, { estado_cuenta: 'SUSPENDIDA' as const }, { deleted_at: now.toISOString() },
    { id: campusId }, { campus_id: userId }]) {
    await assert.rejects(createCommunityActivity({ ...auth, profile: { ...auth.profile, ...patch } }, parsed(), {
      getActiveMap: async () => map, now: () => now, createActivity: async () => { writes++; throw new Error('Should not write'); },
    }), { status: 403 });
  }
  assert.equal(writes, 0);
});

test('creation refuses mesh names, cross-floor/hidden/deleted POIs, foreign maps and ended dates', async () => {
  let writes = 0;
  const dependencies = { getActiveMap: async () => map, now: () => now,
    createActivity: async () => { writes++; throw new Error('Should not write'); } };
  for (const location of [ { buildingKey: 'missing', floorKey: 'floor-two' },
    { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2' },
    ...['hidden', 'deleted', 'other-floor'].map(poiKey => ({ ...body().location, poiKey })) ]) {
    await assert.rejects(createCommunityActivity(auth, parsed({ ...body(), location }), dependencies), { status: 400 });
  }
  await assert.rejects(createCommunityActivity(auth, parsed(), { ...dependencies, getActiveMap: async () => ({ ...map, campusId: userId }) }), { status: 404 });
  await assert.rejects(createCommunityActivity(auth, parsed({ ...body(), startAt: '2099-10-09T12:00:00.000Z', endAt: now.toISOString() }), dependencies), { status: 400 });
  assert.equal(writes, 0);
});

test('creation transaction commits organizer JOINED and activity count together, propagates failure and revalidates location', async () => {
  const session = { withTransaction: async (operation: () => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    staged = []; try { const result = await operation(); committed.push(...staged); return result; } finally { staged = []; }
  } };
  let staged: { name: string; value: ActivityDocument | ActivityParticipationDocument }[] = [];
  const committed: typeof staged = []; let failParticipation = false; let activeMap = map;
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: (value: typeof session) => Promise<unknown>) => operation(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({
    indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOne: async (filter: unknown, options: { session: unknown }) => {
      assert.equal(name, 'campus_maps'); assert.equal(options.session, session);
      assert.deepEqual(filter, { campusId, status: 'ACTIVE' }); return activeMap;
    },
    insertOne: async (value: ActivityDocument | ActivityParticipationDocument, options: { session: unknown }) => {
      assert.equal(options.session, session);
      if (name === 'activity_participation' && failParticipation) throw new Error('Participation failed');
      staged.push({ name, value });
    },
  }));
  try {
    const dependencies = { getActiveMap: async () => map, now: () => now };
    const created = await createCommunityActivity(auth, parsed(), dependencies);
    assert.equal(committed.length, 2);
    const activity = committed[0].value as ActivityDocument; const own = committed[1].value as ActivityParticipationDocument;
    assert.equal(activity._id.toHexString(), created.id); assert.equal(activity.participantCount, 1);
    assert.deepEqual(own.activityId, activity._id); assert.equal(own.campusId, campusId); assert.equal(own.userId, userId);
    assert.equal(own.status, 'JOINED'); assert.deepEqual(own.joinedAt, activity.createdAt);
    failParticipation = true;
    await assert.rejects(createCommunityActivity(auth, parsed(), dependencies), /Participation failed/);
    assert.equal(committed.length, 2); assert.equal(staged.length, 0);
    activeMap = { ...map, buildings: [] };
    await assert.rejects(createCommunityActivity(auth, parsed(), dependencies), { status: 400 });
    assert.equal(committed.length, 2);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('creation cannot write without full unique index', async () => {
  let writes = 0;
  const dbMock = mock.method(Db.prototype, 'collection', () => ({ indexes: async () => [], insertOne: async () => { writes++; } }));
  try { await assert.rejects(createCommunityActivity(auth, parsed(), { getActiveMap: async () => map, now: () => now }), { status: 503 }); }
  finally { dbMock.mock.restore(); }
  assert.equal(writes, 0);
});

test('HTTP creation requires identity, rejects overrides, returns 201 JOINED without caching', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  let writes = 0;
  const app = express(); app.use(express.json()); app.use('/api/v1/activities', createActivitiesRouter({
    getActiveMap: async () => map, now: () => now,
    createActivity: async document => { writes++; return toVisibleActivity(document, campusId, now, spatialBuildings(map))!; },
  })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities`;
  const headers = { Authorization: 'Bearer create.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url, { method: 'POST' })).status, 401);
    for (const key of ['campusId', 'type', 'createdByUserId', 'participantCount']) {
      assert.equal((await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body(), [key]: 'override' }) })).status, 400);
    }
    assert.equal((await originalFetch(url + '?campusId=' + userId, { method: 'POST', headers, body: JSON.stringify(body()) })).status, 400);
    assert.equal(writes, 0);
    const response = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify(body()) });
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const created = (await response.json()).data;
    assert.equal(created.type, 'COMMUNITY_ACTIVITY'); assert.equal(created.campusId, campusId);
    assert.deepEqual(created.participation, { status: 'JOINED', canJoin: false }); assert.equal(writes, 1);
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('form validates local calendar/time, content bounds, chronology and POI hierarchy before submission', () => {
  for (const [date, time] of [['30/02/2099', '12:00'], ['10/10/2099', '24:00'], ['10/10/2099', '12:60'], ['2099-10-10', '12:00']]) {
    assert.equal(localActivityTimestamp(date, time), null);
  }
  assert.ok(localActivityTimestamp('29/02/2096', '12:30'));
  const locations = [{ id: 'hbuilding', name: 'H', floors: [{ id: 'floor-two', name: 'Piso 2', pois: [{ id: 'sala', name: 'Sala' }] }] }];
  const draft = { title: 'Taller', description: 'Descripción', startDate: '11/10/2099', startTime: '12:00',
    endDate: '11/10/2099', endTime: '13:00', ...body().location, poiKey: '', customLabel: '' };
  const valid = validateActivityDraft(draft, locations, 0); assert.ok(valid.input); assert.equal(valid.input.location.poiKey, undefined);
  assert.ok(validateActivityDraft({ ...draft, poiKey: 'sala' }, locations, 0).input);
  for (const patch of [{ endTime: '11:00' }, { title: 'x'.repeat(121) }, { description: '' }, { floorKey: 'hbuilding_floor2' },
    { poiKey: 'hidden' }, { buildingKey: 'other-campus' }]) assert.ok(validateActivityDraft({ ...draft, ...patch }, locations, 0).error);
  assert.ok(validateActivityDraft(draft, locations, Date.parse('2100-01-01T00:00:00Z')).error);
});
