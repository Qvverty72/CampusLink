import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivityParticipationDocument } from '../src/modules/activities/activities.types.js';
import type { ActivityDependencies } from '../src/modules/activities/activities.service.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { parseActivityDeletion, parseActivityParticipantsQuery } from '../src/modules/activities/activities.management.validation.js';
import { toVisibleActivity } from '../src/modules/activities/activities.policy.js';
import { spatialBuildings } from '../src/modules/activities/activities.location.js';

const campusId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333';
const now = new Date('2099-10-10T12:00:00Z');
const id = new ObjectId('6aca54943ee1163266a77bb9');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Nombre Apellido', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null } };
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'h', name: 'Edificio H', floors: [{ id: 'h1', name: 'Piso 1', pois: [] }] }] };
const document = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({ _id: id, campusId, createdByUserId: userId,
  title: 'Actividad', description: 'Grupo de estudio', type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2099-10-11T12:00:00Z'), endAt: new Date('2099-10-11T13:00:00Z'), location: { buildingKey: 'h', floorKey: 'h1' },
  participantCount: 7, createdAt: now, updatedAt: now, ...patch });
const deps = (value = document()): ActivityDependencies => ({ getActiveMap: async () => map, now: () => now, findActivity: async () => value });
let service: typeof import('../src/modules/activities/activities.management.service.js');
let repository: typeof import('../src/modules/activities/activities.management.repository.js');
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', SUPABASE_URL: 'https://management-test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  service = await import('../src/modules/activities/activities.management.service.js');
  repository = await import('../src/modules/activities/activities.management.repository.js');
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('pagination and deletion reject overrides, malformed values and unbounded page sizes', () => {
  assert.deepEqual(parseActivityParticipantsQuery({}), { success: true, data: { page: 1, pageSize: 5 } });
  for (const input of [[], null, { page: ['1'] }, { page: '0' }, { page: '1.5' }, { page: '100001' }, { pageSize: '21' }, { campusId }, { userId }]) {
    assert.equal(parseActivityParticipantsQuery(input).success, false);
  }
  assert.equal(parseActivityDeletion({ expectedRevision: 0 }).success, true);
  for (const input of [undefined, [], {}, { expectedRevision: '0' }, { expectedRevision: -1 }, { expectedRevision: 0, campusId },
    { expectedRevision: Number.MAX_SAFE_INTEGER }]) assert.equal(parseActivityDeletion(input).success, false);
});

test('same-campus non-owner can read only names; unavailable profiles stay anonymous', async () => {
  const result = await service.getActivityParticipants(auth, id.toHexString(), { page: 2, pageSize: 5 }, { ...deps(document({ createdByUserId: other })),
    findParticipants: async (value, query) => {
      assert.equal(value.campusId, campusId); assert.equal(query.page, 2);
      return { ...query, total: 7, rows: [{ key: 'p1', userId }, { key: 'p2', userId: other }] };
    }, findParticipantNames: async (campus, ids) => {
      assert.equal(campus, campusId); assert.deepEqual(ids, [userId, other]); return new Map([[userId, ' Nombre Apellido ']]);
    } });
  assert.deepEqual(result.participants, [{ key: 'p1', name: 'Nombre Apellido' }, { key: 'p2', name: null }]);
  assert.equal(JSON.stringify(result).includes(userId), false);
});

test('foreign campus, hidden, ended, deleted and unavailable location never expose participant identities', async () => {
  for (const patch of [{ campusId: other }, { status: 'DELETED' }, { visibility: 'HIDDEN' }, { deletedAt: now },
    { endAt: now }, { location: { buildingKey: 'unknown', floorKey: 'h1' } }]) {
    let reads = 0;
    await assert.rejects(service.getActivityParticipants(auth, id.toHexString(), { page: 1, pageSize: 5 }, { ...deps(document(patch)),
      findParticipants: async () => { reads++; throw Error('Should not read'); } }), { status: 404 });
    assert.equal(reads, 0);
  }
  await assert.rejects(service.getActivityParticipants({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } },
    id.toHexString(), { page: 1, pageSize: 5 }, deps()), { status: 403 });
});

test('delete requires ownership even for an administrator and rejects stale revisions without writing', async () => {
  let writes = 0;
  const deleteActivity: NonNullable<ActivityDependencies['deleteActivity']> = async (_auth, activityId, revision) => {
    writes++; return { activityId, campusId, revision: revision + 1, deletedAt: now.toISOString() };
  };
  const admin = { ...auth, roles: [{ id: other, name: 'ADMINISTRADOR', campusId }] };
  await assert.rejects(service.deleteOwnActivity(admin, id.toHexString(), 0, { ...deps(document({ createdByUserId: other })), deleteActivity }), { status: 403 });
  await assert.rejects(service.deleteOwnActivity(auth, id.toHexString(), 0, { ...deps(document({ editRevision: 2 })), deleteActivity }), { status: 409 });
  await assert.rejects(service.deleteOwnActivity(auth, id.toHexString(), 0, { ...deps(document({ campusId: other })), deleteActivity }), { status: 404 });
  assert.equal(writes, 0);
  const receipt = await service.deleteOwnActivity(auth, id.toHexString(), 2, { ...deps(document({ editRevision: 2 })), deleteActivity });
  assert.equal(receipt.revision, 3); assert.equal(writes, 1);
});

test('Mongo pages exclude LEFT, preserve legacy creator semantics and clamp an emptied last page', async () => {
  let creator: ActivityParticipationDocument | null = null;
  let joined = Array.from({ length: 6 }, (_, index) => ({ _id: new ObjectId((index + 1).toString(16).padStart(24, '0')), userId: other }));
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async callback => callback({ withTransaction: async work => work() }));
  const dbMock = mock.method(Db.prototype, 'collection', name => {
    if (name === 'activities') return { findOne: async () => document() };
    if (name === 'campus_maps') return { findOne: async () => map };
    assert.equal(name, 'activity_participation');
    return { findOne: async filter => { assert.equal(filter.userId, userId); return creator; },
      countDocuments: async filter => { assert.equal(filter.status, 'JOINED'); assert.equal(filter.campusId, campusId); return joined.length; },
      find: filter => {
        assert.equal(filter.status, 'JOINED'); let offset = 0; let count = 0;
        const cursor = { sort: sort => { assert.deepEqual(sort, { _id: 1 }); return cursor; },
          skip: value => { offset = value; return cursor; }, limit: value => { count = value; return cursor; },
          toArray: async () => joined.slice(offset, offset + count) }; return cursor;
      } };
  });
  try {
    let page = await repository.findActivityParticipants(document(), { page: 1, pageSize: 5 });
    assert.equal(page.total, 7); assert.equal(page.rows[0].key, 'creator'); assert.equal(page.rows.length, 5);
    page = await repository.findActivityParticipants(document(), { page: 2, pageSize: 5 });
    assert.deepEqual(page.rows.map(row => row.key), joined.slice(4).map(row => row._id.toHexString()));
    creator = { activityId: id, campusId, userId, status: 'LEFT', joinedAt: now, updatedAt: now };
    joined = joined.slice(0, 1);
    page = await repository.findActivityParticipants(document(), { page: 2, pageSize: 5 });
    assert.equal(page.page, 1); assert.equal(page.total, 1); assert.equal(page.rows.some(row => row.key === 'creator'), false);
    creator.status = 'JOINED';
    page = await repository.findActivityParticipants(document(), { page: 1, pageSize: 5 });
    assert.equal(page.rows.some(row => row.key === 'creator'), false);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('soft deletion writes only the selected occurrence plus embedded audit, preserving participants and template', async () => {
  const value = document({ editRevision: 2, seriesId: new ObjectId(), occurrenceIndex: 1, occurrenceCount: 3,
    originalStartAt: new Date('2099-10-11T12:00:00Z') });
  let updated: Record<string, any> | null = null;
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async callback => callback({ withTransaction: async work => work() }));
  const dbMock = mock.method(Db.prototype, 'collection', name => {
    if (name === 'campus_maps') return { findOne: async () => map };
    assert.equal(name, 'activities');
    return { findOne: async () => value, updateOne: async (filter, update) => {
      assert.equal(filter._id.toHexString(), id.toHexString()); assert.equal(filter.campusId, campusId);
      assert.equal(filter.createdByUserId, userId); assert.equal(filter.editRevision, 2); assert.equal(filter.status, 'ACTIVE');
      updated = update; return { matchedCount: 1 };
    } };
  });
  try {
    const receipt = await repository.commitActivityDeletion(auth, id.toHexString(), 2, now);
    assert.equal(receipt.revision, 3); assert.ok(updated);
    const update = updated as Record<string, any>;
    assert.equal(update.$set.status, 'DELETED'); assert.equal(update.$set.deletedByUserId, userId);
    assert.equal(update.$push.changeHistory.actorUserId, userId); assert.equal(update.$push.changeHistory.scope, 'ONE');
    assert.equal(update.$push.changeHistory.before.status, 'ACTIVE'); assert.equal(update.$push.changeHistory.after.status, 'DELETED');
    for (const key of ['participantCount', 'seriesDefinition', 'seriesId', 'location']) assert.equal(key in update.$set, false);
    assert.equal('$unset' in update, false); assert.equal('$inc' in update, false);
    assert.equal(toVisibleActivity({ ...value, ...update.$set }, campusId, now, spatialBuildings(map)), null);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('profile lookup is scoped to campus and never selects email or other private fields', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('select'), 'id,nombre_completo');
    assert.equal(url.searchParams.get('campus_id'), `eq.${campusId}`); assert.equal(url.searchParams.get('deleted_at'), 'is.null');
    return Response.json([{ id: userId, nombre_completo: 'Nombre Apellido' }]);
  };
  try { assert.equal((await repository.findParticipantNames(campusId, [userId])).get(userId), 'Nombre Apellido'); }
  finally { globalThis.fetch = originalFetch; }
});

test('HTTP roster/delete require authentication and reject client campus overrides before repository access', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json());
  app.use('/activities', createActivitiesRouter({ ...deps(), findParticipants: async () => ({ page: 1, pageSize: 5, total: 0, rows: [] }),
    deleteActivity: async (_auth, activityId, revision) => ({ activityId, campusId, revision: revision + 1, deletedAt: now.toISOString() }) }));
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/activities/${id.toHexString()}`;
  const headers = { Authorization: 'Bearer management.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url + '/participants')).status, 401);
    assert.equal((await originalFetch(url, { method: 'DELETE' })).status, 401);
    assert.equal((await originalFetch(url + '/participants?campusId=' + other, { headers })).status, 400);
    assert.equal((await originalFetch(url, { method: 'DELETE', headers, body: JSON.stringify({ expectedRevision: 0, campusId: other }) })).status, 400);
    const response = await originalFetch(url + '/participants', { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).data.total, 0);
    assert.equal((await originalFetch(url, { method: 'DELETE', headers, body: JSON.stringify({ expectedRevision: 0 }) })).status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
