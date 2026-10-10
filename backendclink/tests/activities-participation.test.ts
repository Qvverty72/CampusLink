import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, MongoClient, MongoServerError, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivityParticipationDocument } from '../src/modules/activities/activities.types.js';
import type { ActivityDependencies } from '../src/modules/activities/activities.service.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';

const campusId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const creatorId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2099-10-10T12:00:00Z');
const joinedAt = new Date('2099-10-01T12:00:00Z');
const id = new ObjectId('6aca54943ee1163266a77bb9');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Usuario', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} };
const activity = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({
  _id: id, campusId, createdByUserId: creatorId, title: 'Actividad', description: 'Descripción',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2099-10-11T12:00:00Z'), endAt: new Date('2099-10-11T13:00:00Z'),
  location: { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2' }, participantCount: 2,
  createdAt: joinedAt, updatedAt: joinedAt, editRevision: 3, changeHistory: [], ...patch,
});
const row = (status: 'JOINED' | 'LEFT'): ActivityParticipationDocument => ({
  _id: new ObjectId(), activityId: id, userId, campusId, status, joinedAt, updatedAt: joinedAt,
});
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'hbuilding', name: 'Edificio H', floors: [{ id: 'hbuilding_floor2', meshName: 'h_mesh', name: 'Piso 2', pois: [] }] }] };
let service: typeof import('../src/modules/activities/activities.detail.service.js');
let repository: typeof import('../src/modules/activities/activities.detail.repository.js');
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://participation-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  service = await import('../src/modules/activities/activities.detail.service.js');
  repository = await import('../src/modules/activities/activities.detail.repository.js');
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('own state is scoped and available without a public detail or active map, including legacy creators', async () => {
  const dependencies: ActivityDependencies = { findParticipation: async (campus, activityId, user) => {
    assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); assert.equal(user, userId); return row('LEFT');
  }, getActiveMap: async () => { throw new Error('Historical state must not require a map'); },
  findActivity: async () => { throw new Error('Historical state must not expose content'); } };
  const result = await service.getOwnActivityParticipation(auth, id.toHexString().toUpperCase(), dependencies);
  assert.deepEqual(result, { campusId, activityId: id.toHexString(), status: 'LEFT',
    joinedAt: joinedAt.toISOString(), updatedAt: joinedAt.toISOString() });
  assert.equal('userId' in result, false); assert.equal('title' in result, false);
  const legacy = { ...dependencies, findParticipation: async () => null,
    findCreatedActivity: async () => activity({ createdByUserId: userId, status: 'HIDDEN', endAt: joinedAt }) };
  assert.equal((await service.getOwnActivityParticipation(auth, id.toHexString(), legacy)).status, 'JOINED');
  assert.deepEqual(await service.getOwnActivityParticipation(auth, id.toHexString(), { ...legacy, findCreatedActivity: async () => null }),
    { campusId, activityId: id.toHexString(), status: 'NOT_JOINED' });
});

test('own state rejects invalid stored identity, dates and status instead of inventing a result', async () => {
  for (const patch of [{ campusId: creatorId }, { userId: creatorId }, { activityId: new ObjectId() },
    { joinedAt: new Date('invalid') }, { updatedAt: undefined }, { status: 'REGISTERED' }]) {
    await assert.rejects(service.getOwnActivityParticipation(auth, id.toHexString(), {
      findParticipation: async () => ({ ...row('JOINED'), ...patch } as ActivityParticipationDocument),
    }), { status: 503 });
  }
});

test('participation services authorize before storage and never accept a different identity', async () => {
  let calls = 0;
  const deps: ActivityDependencies = { findParticipation: async () => { calls++; return null; },
    withdrawParticipation: async (campus, activityId, user) => {
      calls++; assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); assert.equal(user, userId);
      return { campusId, activityId, status: 'LEFT', joinedAt: joinedAt.toISOString(), updatedAt: now.toISOString() };
    } };
  for (const operation of [service.getOwnActivityParticipation, service.leaveActivity]) {
    await assert.rejects(operation(auth, 'invalid', deps), { status: 400 });
    await assert.rejects(operation({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } }, id.toHexString(), deps), { status: 403 });
    await assert.rejects(operation({ ...auth, profile: { ...auth.profile, verificado_en: null } }, id.toHexString(), deps), { status: 403 });
  }
  assert.equal(calls, 0);
  assert.equal((await service.leaveActivity(auth, id.toHexString().toUpperCase(), deps)).status, 'LEFT');
  assert.equal(calls, 1);
});

interface Store { document: ActivityDocument; own: ActivityParticipationDocument | null; updates: number; failCounter?: boolean }
async function withStore(store: Store, operation: () => Promise<void>) {
  const session = { withTransaction: async (callback: () => Promise<unknown>) => {
    const original = { own: store.own && { ...store.own }, document: { ...store.document }, updates: store.updates };
    try { return await callback(); } catch (error) { Object.assign(store, original); throw error; }
  } };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (callback: (value: typeof session) => Promise<unknown>) => callback(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => {
    assert.ok(['activities', 'activity_participation', 'campus_maps'].includes(name));
    if (name === 'activity_participation') return {
      indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
      findOne: async (key: unknown) => { assert.deepEqual(key, { campusId, activityId: id, userId }); return store.own; },
      updateOne: async (_key: unknown, update: { $set: Partial<ActivityParticipationDocument>; $setOnInsert: Partial<ActivityParticipationDocument> }, options: { session: unknown; upsert: boolean }) => {
        assert.equal(options.session, session); assert.equal(options.upsert, true);
        store.own = { ...(store.own ?? update.$setOnInsert), ...update.$set } as ActivityParticipationDocument;
        return { matchedCount: 1 };
      },
    };
    if (name === 'campus_maps') return { findOne: async () => map };
    return {
      findOne: async (filter: Record<string, unknown>, options: { session: unknown }) => {
        assert.equal(filter.campusId, campusId); assert.deepEqual(filter._id, id); assert.equal(options.session, session); return store.document;
      },
      updateOne: async (filter: Record<string, unknown>, update: { $inc: { participantCount: number }; $set: { updatedAt: Date } }, options: { session: unknown }) => {
        assert.equal(options.session, session);
        if (store.failCounter) return { matchedCount: 0 };
        if (update.$inc.participantCount === -1) assert.deepEqual(filter.participantCount, { $gte: 1 });
        store.document = { ...store.document, participantCount: store.document.participantCount + update.$inc.participantCount, updatedAt: update.$set.updatedAt };
        store.updates++;
        return { matchedCount: 1 };
      },
    };
  });
  try { await operation(); } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
}

test('leave is idempotent, retains row/id/join date, and rejoin increments exactly once', async () => {
  const original = row('JOINED');
  const store: Store = { document: activity(), own: original, updates: 0 };
  await withStore(store, async () => {
    const first = await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(first.status, 'LEFT'); assert.equal(first.joinedAt, joinedAt.toISOString()); assert.equal(first.updatedAt, now.toISOString());
    assert.equal(store.own?._id, original._id); assert.equal(store.document.participantCount, 1);
    assert.deepEqual(await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, new Date(now.getTime() + 1000)), first);
    assert.equal(store.updates, 1);
    await repository.registerActivityParticipation(campusId, id.toHexString(), userId, now);
    await repository.registerActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(store.own?.status, 'JOINED'); assert.deepEqual(store.own?.joinedAt, now);
    assert.equal(store.document.participantCount, 2); assert.equal(store.updates, 2);
    assert.equal(store.document.editRevision, 3); assert.deepEqual(store.document.changeHistory, []);
  });
});

test('legacy creator can leave, then rejoin once; strangers and existing LEFT rows cause no writes', async () => {
  const store: Store = { document: activity({ createdByUserId: userId, participantCount: 1 }), own: null, updates: 0 };
  await withStore(store, async () => {
    assert.equal((await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now)).status, 'LEFT');
    assert.equal(store.own?.joinedAt, joinedAt); assert.equal(store.document.participantCount, 0);
    await repository.registerActivityParticipation(campusId, id.toHexString(), userId, now);
    await repository.registerActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(store.document.participantCount, 1); assert.equal(store.updates, 2);
    store.own = null; store.document.createdByUserId = creatorId;
    assert.equal((await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now)).status, 'NOT_JOINED');
    assert.equal(store.own, null); assert.equal(store.updates, 2);
    store.own = row('LEFT');
    await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now);
    assert.equal(store.updates, 2);
  });
});

test('withdrawal is allowed after expiry/hiding but does not modify series, edit revision or history', async () => {
  const seriesId = new ObjectId();
  const store: Store = { document: activity({ status: 'HIDDEN', endAt: joinedAt, seriesId, occurrenceIndex: 2, occurrenceCount: 4 }), own: row('JOINED'), updates: 0 };
  const original = { ...store.document };
  await withStore(store, async () => {
    await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now);
    const { participantCount, updatedAt, ...unchanged } = store.document;
    const { participantCount: _count, updatedAt: _date, ...before } = original;
    assert.deepEqual(unchanged, before); assert.equal(participantCount, 1); assert.equal(updatedAt.toISOString(), now.toISOString());
  });
});

test('invalid counters and failed counter writes cannot leave a partial LEFT row', async () => {
  for (const count of [0, -1, 1.5, Number.NaN]) {
    const store: Store = { document: activity({ participantCount: count }), own: row('JOINED'), updates: 0 };
    await withStore(store, async () => {
      await assert.rejects(repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now), { status: 503 });
      assert.equal(store.own?.status, 'JOINED'); assert.equal(store.updates, 0);
    });
  }
  const store: Store = { document: activity(), own: row('JOINED'), updates: 0, failCounter: true };
  await withStore(store, async () => {
    await assert.rejects(repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now), { status: 409 });
    assert.equal(store.own?.status, 'JOINED'); assert.equal(store.document.participantCount, 2);
  });
});

test('withdrawal requires the existing full unique index and handles concurrent legacy upserts', async () => {
  const missing = mock.method(Db.prototype, 'collection', () => ({ indexes: async () => [] }));
  try { await assert.rejects(repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now), { status: 503 }); }
  finally { missing.mock.restore(); }
  let current = row('LEFT');
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async () => { throw new MongoServerError({ code: 11000, message: 'Concurrent upsert' }); });
  const dbMock = mock.method(Db.prototype, 'collection', () => ({ indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }], findOne: async () => current }));
  try {
    assert.equal((await repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now)).status, 'LEFT');
    current = row('JOINED');
    await assert.rejects(repository.withdrawActivityParticipation(campusId, id.toHexString(), userId, now), { status: 409 });
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('HTTP GET/DELETE require authentication, reject identity/state overrides and retain own state after expiry', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    return Response.json([]);
  };
  let own: ActivityParticipationDocument | null = row('JOINED');
  let withdrawals = 0;
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json());
  app.use('/api/v1/activities', createActivitiesRouter({ getActiveMap: async () => map,
    findActivity: async () => activity({ endAt: joinedAt }), findParticipation: async () => own,
    findCreatedActivity: async () => null, withdrawParticipation: async (campus, activityId, user) => {
      assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); assert.equal(user, userId);
      if (own?.status === 'JOINED') { own = { ...own, status: 'LEFT', updatedAt: now }; withdrawals++; }
      return { campusId, activityId, status: own!.status, joinedAt: joinedAt.toISOString(), updatedAt: own!.updatedAt.toISOString() };
    }, now: () => now }));
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities/${id.toHexString()}`;
  const headers = { Authorization: 'Bearer participation.test.token', 'Content-Type': 'application/json' };
  try {
    for (const method of ['GET', 'DELETE']) {
      assert.equal((await originalFetch(url + '/participation', { method })).status, 401);
      assert.equal((await originalFetch(url + '/participation?userId=' + creatorId, { method, headers })).status, 400);
      assert.equal((await originalFetch(url.replace(id.toHexString(), 'bad') + '/participation', { method, headers })).status, 400);
    }
    for (const body of [{ userId: creatorId }, { campusId: creatorId }, { status: 'LEFT' }]) {
      assert.equal((await originalFetch(url + '/participation', { method: 'DELETE', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(withdrawals, 0);
    assert.equal((await originalFetch(url, { headers })).status, 404);
    const ownResponse = await originalFetch(url + '/participation', { headers });
    assert.equal(ownResponse.headers.get('cache-control'), 'no-store');
    assert.equal((await ownResponse.json()).data.status, 'JOINED');
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await originalFetch(url + '/participation', { method: 'DELETE', headers });
      assert.equal(response.status, 200); const data = (await response.json()).data;
      assert.equal(data.status, 'LEFT'); assert.equal('userId' in data, false); assert.equal('title' in data, false);
    }
    assert.equal(withdrawals, 1);
    assert.equal((await (await originalFetch(url + '/participation', { headers })).json()).data.status, 'LEFT');
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
