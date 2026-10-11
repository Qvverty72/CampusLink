import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, MongoClient, MongoServerError, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivityParticipationDocument } from '../src/modules/activities/activities.types.js';
import type { ActivityDependencies } from '../src/modules/activities/activities.service.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { parseActivityId, parseEmptyActivityInput } from '../src/modules/activities/activities.validation.js';

const campusId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const creatorId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2099-10-10T12:00:00Z');
const id = new ObjectId('6aca54943ee1163266a77bb9');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Mi nombre', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} };
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'cabin01', name: 'Cabaña 1', floors: [{ id: 'floor-id', meshName: 'cabin01_floor1', name: 'Piso 1',
    pois: [{ poiKey: 'sala', name: 'Sala 101', isVisible: true }, { poiKey: 'hidden', name: 'Oculto', isVisible: false }] }] }] };
const document = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({
  _id: id, campusId, createdByUserId: creatorId, title: 'Actividad', description: 'Descripción',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2099-10-11T12:00:00Z'), endAt: new Date('2099-10-11T13:00:00Z'),
  location: { buildingKey: 'cabin01', floorKey: 'floor-id' }, participantCount: 1, createdAt: now, updatedAt: now, ...patch,
});
const participation = (status: 'JOINED' | 'LEFT'): ActivityParticipationDocument => ({
  activityId: id, userId, campusId, status, joinedAt: now, updatedAt: now,
});
const deps = (value = document(), own: ActivityParticipationDocument | null = null): ActivityDependencies => ({
  getActiveMap: async () => map, now: () => now,
  findActivity: async (campus, activityId) => { assert.equal(campus, campusId); assert.equal(activityId.toLowerCase(), id.toHexString()); return value; },
  findOrganizer: async creator => { assert.equal(creator, creatorId); return { name: 'Organizador' }; },
  findParticipation: async (campus, activityId, user) => {
    assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); assert.equal(user, userId); return own;
  },
});
let getActivityDetail: typeof import('../src/modules/activities/activities.detail.service.js').getActivityDetail;
let joinActivity: typeof import('../src/modules/activities/activities.detail.service.js').joinActivity;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://detail-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  ({ getActivityDetail, joinActivity } = await import('../src/modules/activities/activities.detail.service.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('detail and participation validation reject malformed IDs and identity/state/campus overrides', () => {
  assert.equal(parseActivityId({ activityId: id.toHexString().toUpperCase() }).success, true);
  for (const activityId of ['123', '../maps', 'z'.repeat(24), ['a'.repeat(24)], { $ne: '' }]) {
    assert.equal(parseActivityId({ activityId }).success, false);
  }
  for (const input of [undefined, {}]) assert.equal(parseEmptyActivityInput(input).success, true);
  for (const input of [null, [], 'JOINED', { userId: creatorId }, { campusId }, { status: 'JOINED' }]) {
    assert.equal(parseEmptyActivityInput(input).success, false);
  }
});

test('detail resolves organizer and data location without requiring POI or optional metadata', async () => {
  const detail = await getActivityDetail(auth, id.toHexString(), deps());
  assert.deepEqual(detail.organizer, { name: 'Organizador' });
  assert.equal(detail.location.floorKey, 'floor-id');
  assert.equal(detail.location.floorName, 'Piso 1');
  assert.equal(detail.location.poiName, undefined);
  assert.deepEqual(detail.participation, { status: 'NOT_JOINED', canJoin: true });
  assert.equal('createdByUserId' in detail, false); assert.equal('userId' in detail, false);
  assert.equal(detail.bannerUrl, undefined); assert.equal(detail.category, undefined); assert.equal(detail.tags, undefined);
  const withPoi = await getActivityDetail(auth, id.toHexString(), deps(document({ type: 'OFFICIAL_EVENT',
    bannerUrl: 'https://images.example/banner.jpg', category: 'Cultura', tags: [' Música ', ''],
    location: { buildingKey: 'cabin01', floorKey: 'floor-id', poiKey: 'sala' } })));
  assert.equal(withPoi.location.poiName, 'Sala 101'); assert.equal(withPoi.bannerUrl, 'https://images.example/banner.jpg');
  assert.deepEqual(withPoi.tags, ['Música']);
});

test('detail exposes only a valid stored participant count without participant identities or invented zero', async () => {
  for (const participantCount of [0, 1, 37, Number.MAX_SAFE_INTEGER]) {
    const detail = await getActivityDetail(auth, id.toHexString(), deps(document({ participantCount })));
    assert.equal(detail.participantCount, participantCount);
    assert.equal('participants' in detail, false);
    assert.equal('userId' in detail, false);
  }
  for (const participantCount of [undefined, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const detail = await getActivityDetail(auth, id.toHexString(), deps(document({ participantCount })));
    assert.equal('participantCount' in detail, false);
  }
});

test('direct detail cannot bypass publication, campus, expiry, malformed dates or inactive location', async () => {
  for (const patch of [
    { campusId: creatorId }, { status: 'HIDDEN' }, { status: 'CANCELLED' }, { visibility: 'PRIVATE' },
    { endAt: now }, { startAt: new Date('invalid') }, { type: 'OTHER' },
    { _id: new ObjectId() }, { location: { buildingKey: 'cabin01', floorKey: 'floor-id', poiKey: 'hidden' } },
    { location: { buildingKey: 'cabin01', floorKey: 'missing' } },
  ]) {
    let extraReads = 0;
    await assert.rejects(getActivityDetail(auth, id.toHexString(), { ...deps(document(patch)),
      findParticipation: async () => { extraReads++; return null; },
      findOrganizer: async () => { extraReads++; return null; } }), { status: 404 });
    assert.equal(extraReads, 0);
  }
  let reads = 0;
  await assert.rejects(getActivityDetail({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } }, id.toHexString(),
    { ...deps(), findActivity: async () => { reads++; return document(); } }), { status: 403 });
  assert.equal(reads, 0);
});

test('participation uses only own record, honors LEFT and counts the creator without registering twice', async () => {
  for (const status of ['JOINED', 'LEFT'] as const) {
    const detail = await getActivityDetail(auth, id.toHexString(), deps(document(), participation(status)));
    assert.deepEqual(detail.participation, { status, canJoin: status === 'LEFT' });
  }
  const creator = document({ createdByUserId: userId });
  const detail = await getActivityDetail(auth, id.toHexString(), deps(creator));
  assert.deepEqual(detail.organizer, { name: 'Mi nombre' });
  assert.deepEqual(detail.participation, { status: 'JOINED', canJoin: false });
  let writes = 0;
  await joinActivity(auth, id.toHexString(), { ...deps(creator), registerParticipation: async () => { writes++; } });
  assert.equal(writes, 0);
  assert.equal((await getActivityDetail(auth, id.toHexString(), deps(creator, participation('LEFT')))).participation.canJoin, true);
  for (const patch of [{ userId: creatorId }, { campusId: creatorId }, { activityId: new ObjectId() }]) {
    await assert.rejects(getActivityDetail(auth, id.toHexString(), deps(document(), { ...participation('JOINED'), ...patch })), { status: 503 });
  }
});

test('missing organizer is explicit, unsafe banners are omitted and dependency failure does not fake participation', async () => {
  const detail = await getActivityDetail(auth, id.toHexString(), { ...deps(document({ bannerUrl: 'javascript:alert(1)' })), findOrganizer: async () => null });
  assert.equal(detail.organizer, null); assert.equal(detail.bannerUrl, undefined);
  await assert.rejects(getActivityDetail(auth, id.toHexString(), { ...deps(), findParticipation: async () => { throw new Error('Unavailable'); } }));
});

test('minimal registration is server-scoped, idempotent and supports a previously LEFT participant', async () => {
  let own: ActivityParticipationDocument | null = participation('LEFT');
  let writes = 0;
  const dependencies = { ...deps(), findParticipation: async () => own,
    registerParticipation: async (campus: string, activityId: string, user: string) => {
      assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); assert.equal(user, userId);
      writes++; own = participation('JOINED');
    } };
  assert.equal((await joinActivity(auth, id.toHexString(), dependencies)).participation.status, 'JOINED');
  assert.equal((await joinActivity(auth, id.toHexString(), dependencies)).participation.status, 'JOINED');
  assert.equal(writes, 1);
  await assert.rejects(joinActivity(auth, id.toHexString(), { ...dependencies, findActivity: async () => document({ status: 'HIDDEN' }) }), { status: 404 });
  assert.equal(writes, 1);
});

test('repository queries isolate activity and own participation; organizer projects only name', async () => {
  const captured: { name: string; filter: Record<string, unknown> }[] = [];
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({
    findOne: async (filter: Record<string, unknown>) => { captured.push({ name, filter }); return null; },
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/rest/v1/perfil_usuario');
    assert.equal(url.searchParams.get('select'), 'nombre_completo');
    assert.equal(url.searchParams.get('id'), 'eq.' + creatorId);
    assert.equal(url.searchParams.get('deleted_at'), 'is.null');
    return Response.json({ nombre_completo: 'Nombre público' });
  };
  try {
    const repository = await import('../src/modules/activities/activities.detail.repository.js');
    await repository.findVisibleActivity(campusId, id.toHexString(), now);
    await repository.findOwnParticipation(campusId, id.toHexString(), userId);
    assert.equal(captured[0].filter.campusId, campusId); assert.deepEqual(captured[0].filter._id, id);
    assert.equal(captured[0].filter.visibility, 'PUBLIC'); assert.deepEqual(captured[0].filter.endAt, { $gt: now });
    assert.deepEqual(captured[1], { name: 'activity_participation', filter: { campusId, activityId: id, userId } });
    assert.deepEqual(await repository.findActivityOrganizer(creatorId), { name: 'Nombre público' });
  } finally { dbMock.mock.restore(); globalThis.fetch = originalFetch; }
});

test('registration transaction preserves count on repeat and commits JOINED plus one increment together', async () => {
  let own: ActivityParticipationDocument | null = null;
  const activity = document();
  let activeMap = map;
  let increments = 0;
  const session = { withTransaction: async (operation: () => Promise<void>) => operation() };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: (value: typeof session) => Promise<void>) => operation(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => name === 'activity_participation' ? {
    indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOne: async (key: Record<string, unknown>, options: { session: unknown }) => {
      assert.deepEqual(key, { campusId, activityId: id, userId }); assert.equal(options.session, session); return own;
    },
    updateOne: async (_key: unknown, update: { $set: ActivityParticipationDocument; $setOnInsert: ActivityParticipationDocument }, options: { session: unknown; upsert: boolean }) => {
      assert.equal(options.session, session); assert.equal(options.upsert, true);
      own = { ...update.$setOnInsert, ...update.$set }; assert.equal(own.status, 'JOINED');
    },
  } : name === 'campus_maps' ? {
    findOne: async (filter: Record<string, unknown>, options: { session: unknown }) => {
      assert.deepEqual(filter, { campusId, status: 'ACTIVE' }); assert.equal(options.session, session); return activeMap;
    },
  } : {
    findOne: async (filter: Record<string, unknown>, options: { session: unknown }) => {
      assert.equal(filter.campusId, campusId); assert.equal(filter.status, 'ACTIVE'); assert.equal(options.session, session); return activity;
    },
    updateOne: async (_key: unknown, update: { $inc: { participantCount: number } }, options: { session: unknown }) => {
      assert.equal(options.session, session); assert.equal(update.$inc.participantCount, 1); increments++;
    },
  });
  try {
    const { registerActivityParticipation } = await import('../src/modules/activities/activities.detail.repository.js');
    await registerActivityParticipation(campusId, id.toHexString(), userId, now);
    await registerActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(increments, 1);
    own = participation('LEFT');
    await registerActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(increments, 2);
    activeMap = { ...map, buildings: [] };
    await assert.rejects(registerActivityParticipation(campusId, id.toHexString(), userId, now), { status: 404 });
    assert.equal(increments, 2);
    activeMap = map;
    own = null; activity.createdByUserId = userId;
    await registerActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(increments, 2);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('registration refuses to write without a complete unique participation index', async () => {
  for (const indexes of [[], [{ key: { activityId: 1, userId: 1 }, unique: false }],
    [{ key: { activityId: 1, userId: 1 }, unique: true, partialFilterExpression: { status: 'JOINED' } }]]) {
    const dbMock = mock.method(Db.prototype, 'collection', () => ({ indexes: async () => indexes }));
    try {
      const { registerActivityParticipation } = await import('../src/modules/activities/activities.detail.repository.js');
      await assert.rejects(registerActivityParticipation(campusId, id.toHexString(), userId, now), { status: 503 });
    } finally { dbMock.mock.restore(); }
  }
});

test('a duplicate-key registration race returns an existing JOINED state without another increment', async () => {
  let own = participation('JOINED');
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async () => {
    throw new MongoServerError({ code: 11000, message: 'Concurrent registration' });
  });
  const dbMock = mock.method(Db.prototype, 'collection', () => ({
    indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOne: async () => own,
  }));
  try {
    const { registerActivityParticipation } = await import('../src/modules/activities/activities.detail.repository.js');
    await registerActivityParticipation(campusId, id.toHexString(), userId, now);
    own = participation('LEFT');
    await assert.rejects(registerActivityParticipation(campusId, id.toHexString(), userId, now), { status: 409 });
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('HTTP detail and join require identity, reject overrides and return own state without cache', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  let own: ActivityParticipationDocument | null = null;
  let reads = 0; let writes = 0;
  const app = express(); app.use(express.json());
  app.use('/api/v1/activities', createActivitiesRouter({ ...deps(), findActivity: async () => { reads++; return document(); },
    findParticipation: async () => own, registerParticipation: async () => { writes++; own = participation('JOINED'); } }));
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities/${id.toHexString()}`;
  const headers = { Authorization: 'Bearer detail.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url)).status, 401);
    assert.equal((await originalFetch(url + '/participation', { method: 'PUT' })).status, 401);
    assert.equal((await originalFetch(url.replace(id.toHexString(), 'invalid'), { headers })).status, 400);
    assert.equal((await originalFetch(url + '?campusId=' + creatorId, { headers })).status, 400);
    assert.equal((await originalFetch(url + '/participation', { method: 'PUT', headers, body: JSON.stringify({ userId: creatorId }) })).status, 400);
    assert.equal(reads, 0); assert.equal(writes, 0);
    const detailResponse = await originalFetch(url, { headers });
    assert.equal(detailResponse.status, 200); assert.equal(detailResponse.headers.get('cache-control'), 'no-store');
    assert.equal((await detailResponse.json()).data.participation.status, 'NOT_JOINED');
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await originalFetch(url + '/participation', { method: 'PUT', headers });
      assert.equal(response.status, 200); assert.equal((await response.json()).data.participation.status, 'JOINED');
    }
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
