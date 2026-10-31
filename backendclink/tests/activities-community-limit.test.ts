import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/types/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { activeCommunityActivityFilter, COMMUNITY_ACTIVITY_LIMIT_MESSAGE, toVisibleActivity } from '../src/modules/activities/activities.policy.js';
import { spatialBuildings } from '../src/modules/activities/activities.location.js';

const campusId = '22222222-2222-4222-8222-222222222222', userId = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333', now = new Date('2099-01-01T00:00:00Z');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Organizador', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} };
const publisher = { ...auth, roles: [{ id: 'role', name: 'USUARIO_AUTORIZADO', campusId }],
  permissions: [{ id: 'permission', name: 'PUBLICAR_EVENTO', campusId }] };
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'h', name: 'H', floors: [{ id: 'f', name: 'Piso 1', pois: [] }] }] };
const input = { title: 'Actividad', description: 'Grupo de estudio', startAt: new Date('2099-01-05T12:00:00Z'),
  endAt: new Date('2099-01-05T13:00:00Z'), location: { buildingKey: 'h', floorKey: 'f' } };
const document = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({ _id: new ObjectId(), ...input,
  campusId, createdByUserId: userId, type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  participantCount: 1, createdAt: now, updatedAt: now, ...patch });
let service: typeof import('../src/modules/activities/activities.create.service.js');
let repository: typeof import('../src/modules/activities/activities.create.repository.js');
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', SUPABASE_URL: 'https://community-limit-test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  service = await import('../src/modules/activities/activities.create.service.js');
  repository = await import('../src/modules/activities/activities.create.repository.js');
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('availability is scoped to the current creator/campus, and only the official publication capability exempts the limit', async () => {
  let reads = 0; let existing: ActivityDocument | null = document();
  const dependencies = { now: () => now, getActiveMap: async () => map,
    findActiveCommunityActivity: async (campus: string, user: string, at: Date) => {
      reads++; assert.equal(campus, campusId); assert.equal(user, userId); assert.equal(at, now); return existing;
    }, createActivity: async (value: ActivityDocument, options?: { limitActiveCommunity?: boolean }) => {
      assert.equal(options?.limitActiveCommunity, true); return toVisibleActivity(value, campusId, now, spatialBuildings(map))!;
    } };
  for (const context of [auth, { ...publisher, permissions: [] }, { ...publisher, roles: [] },
    { ...publisher, permissions: [{ ...publisher.permissions[0], campusId: other }] }]) {
    assert.deepEqual(await service.getCommunityActivityCreationAvailability(context, dependencies),
      { campusId, canCreate: false, message: COMMUNITY_ACTIVITY_LIMIT_MESSAGE });
    await service.createCommunityActivity(context, input, dependencies);
  }
  const before = reads;
  for (const context of [publisher, { ...auth, roles: [{ id: 'admin', name: 'ADMINISTRADOR', campusId }] }]) {
    assert.deepEqual(await service.getCommunityActivityCreationAvailability(context, dependencies), { campusId, canCreate: true });
    await service.createCommunityActivity(context, input, { ...dependencies, createActivity: async (value, options) => {
      assert.equal(options?.limitActiveCommunity, false); return toVisibleActivity(value, campusId, now, spatialBuildings(map))!;
    } });
  }
  assert.equal(reads, before);
  existing = null;
  assert.deepEqual(await service.getCommunityActivityCreationAvailability(auth, dependencies), { campusId, canCreate: true });
  for (const profile of [{ estado_cuenta: 'SUSPENDIDA' }, { verificado_en: null }, { campus_id: other }]) {
    await assert.rejects(service.getCommunityActivityCreationAvailability({ ...auth, profile: { ...auth.profile, ...profile } }, dependencies), { status: 403 });
  }
});

test('the quota query counts future/current own community publications, ignores finished/deleted/foreign/official rows and spans locations', async () => {
  const filter = activeCommunityActivityFilter(campusId, userId, now);
  assert.deepEqual(filter, { campusId, createdByUserId: userId, type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE',
    visibility: 'PUBLIC', deletedAt: null, endAt: { $gt: now } });
  let rows: ActivityDocument[] = [];
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({ findOne: async (query: any) => {
    assert.equal(name, 'activities'); assert.deepEqual(query, filter);
    return rows.find(row => row.campusId === query.campusId && row.createdByUserId === query.createdByUserId
      && row.type === query.type && row.status === query.status && row.visibility === query.visibility
      && row.deletedAt == null && row.endAt > query.endAt.$gt) ?? null;
  } }));
  try {
    for (const patch of [{}, { startAt: new Date('2098-12-31T00:00:00Z') }, { location: { buildingKey: 'elsewhere', floorKey: 'another' } }]) {
      rows = [document(patch)]; assert.ok(await repository.findActiveCommunityActivity(campusId, userId, now));
    }
    for (const patch of [{ endAt: now }, { endAt: new Date('2000-01-01') }, { deletedAt: now }, { status: 'DELETED' },
      { status: 'HIDDEN' }, { visibility: 'PRIVATE' }, { campusId: other }, { createdByUserId: other }, { type: 'OFFICIAL_EVENT' }]) {
      rows = [document(patch)]; assert.equal(await repository.findActiveCommunityActivity(campusId, userId, now), null);
    }
  } finally { dbMock.mock.restore(); }
});

test('two concurrent limited publications serialize their quota check and only one commits, with participation in the same transaction', async () => {
  let tail = Promise.resolve(); let locked = 0;
  const committed: { name: string; value: unknown }[] = [];
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: any) => {
    const session: any = { locked: false, staged: [], release: undefined, withTransaction: async (callback: any) => {
      try { const result = await callback(); committed.push(...session.staged); return result; }
      finally { session.release?.(); }
    } };
    return operation(session);
  });
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({
    indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOneAndUpdate: async (_filter: unknown, update: unknown, options: any) => {
      assert.equal(name, 'campus_maps'); assert.deepEqual(update, { $inc: { communityActivityCreationRevision: 1 } });
      const previous = tail; tail = new Promise<void>(resolve => { options.session.release = resolve; });
      await previous; options.session.locked = true; locked++; return map;
    },
    findOne: async (filter: unknown, options: any) => {
      assert.equal(name, 'activities'); assert.equal(options.session.locked, true, 'quota lookup must follow the shared transactional write');
      assert.deepEqual(filter, activeCommunityActivityFilter(campusId, userId, now));
      return committed.find(row => row.name === 'activities')?.value ?? null;
    },
    insertOne: async (value: unknown, options: any) => { assert.equal(options.session.locked, true); options.session.staged.push({ name, value }); },
  }));
  try {
    const results = await Promise.allSettled([repository.insertActivity(document(), { limitActiveCommunity: true }),
      repository.insertActivity(document(), { limitActiveCommunity: true })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(failed.reason.status, 409); assert.equal(failed.reason.message, COMMUNITY_ACTIVITY_LIMIT_MESSAGE);
    assert.equal(locked, 2); assert.deepEqual(committed.map(row => row.name), ['activities', 'activity_participation', 'activity_interactions']);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('HTTP availability requires identity, rejects client campus/limit overrides and returns the quota message without exposing other data', async () => {
  const originalFetch = globalThis.fetch; let existing: ActivityDocument | null = document(); let writes = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]); return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/shared/http/error-handler.js');
  const session = { withTransaction: async (operation: any) => operation() };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: any) => operation(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({
    indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOneAndUpdate: async () => { assert.equal(name, 'campus_maps'); return map; },
    findOne: async () => existing,
    insertOne: async () => { writes++; throw new Error('Unexpected write'); },
  }));
  const app = express(); app.use(express.json()); app.use('/api/v1/activities', createActivitiesRouter({ now: () => now,
    getActiveMap: async () => map, findActiveCommunityActivity: async () => existing }));
  app.use(apiErrorHandler); const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities`;
  const headers = { Authorization: 'Bearer limit.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(base + '/community/creation-availability')).status, 401);
    assert.equal((await originalFetch(base + '/community/creation-availability?campusId=' + other, { headers })).status, 400);
    const response = await originalFetch(base + '/community/creation-availability', { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).data, { campusId, canCreate: false, message: COMMUNITY_ACTIVITY_LIMIT_MESSAGE });
    const refused = await originalFetch(base, { method: 'POST', headers, body: JSON.stringify(input) });
    assert.equal(refused.status, 409); assert.equal((await refused.json()).error.message, COMMUNITY_ACTIVITY_LIMIT_MESSAGE);
    existing = null;
    assert.equal((await (await originalFetch(base + '/community/creation-availability', { headers })).json()).data.canCreate, true);
    assert.equal((await originalFetch(base, { method: 'POST', headers, body: JSON.stringify({ ...input, limitActiveCommunity: false }) })).status, 400);
    assert.equal(writes, 0);
  } finally { globalThis.fetch = originalFetch; dbMock.mock.restore(); sessionMock.mock.restore();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
