import assert from 'node:assert/strict';
import { before, after, mock, test } from 'node:test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { legacyParticipationHistory } from '../src/database/mongodb/005_activity_participation_history.js';
import { parseActivityView } from '../src/modules/activities/activities.validation.js';
import { activityInteractionId, appendActivityInteraction } from '../src/modules/activities/activities.interactions.js';
import { activityOperationId } from '../../frontendclink/src/features/activities/types/interaction.js';
import type { ActivityDocument, ActivityParticipationDocument } from '../src/modules/activities/activities.types.js';
const campusId = '22222222-2222-4222-8222-222222222222', userId = '11111111-1111-4111-8111-111111111111';
const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now = new Date('2099-01-01');
const id = new ObjectId();
let view: typeof import('../src/modules/activities/activities.views.repository.js').recordActivityView;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', SUPABASE_URL: 'https://interactions-test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  ({ recordActivityView: view } = await import('../src/modules/activities/activities.views.repository.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('VIEWED accepts only an explicit opening UUID, rejects actor/time/type overrides and event identities are stable', () => {
  assert.equal(parseActivityView({ type: 'VIEWED', operationId }).success, true);
  for (const patch of [{ type: 'JOINED' }, { type: 'LEFT' }, { type: 'ANY' }, { operationId: 'invalid' },
    { campusId }, { userId }, { occurredAt: now.toISOString() }]) {
    assert.equal(parseActivityView({ type: 'VIEWED', operationId, ...patch }).success, false);
  }
  assert.equal(activityInteractionId('same').toHexString(), activityInteractionId('same').toHexString());
  assert.notEqual(activityInteractionId('same').toHexString(), activityInteractionId('different').toHexString());
  assert.equal(parseActivityView({ type: 'VIEWED', operationId: activityOperationId() }).success, true);
});

test('legacy migration imports only retained timestamps, marks partial history and does not assert a last join was the first', () => {
  const row: ActivityParticipationDocument = { _id: new ObjectId(), activityId: id, campusId, userId, status: 'LEFT',
    joinedAt: new Date('2098-12-01'), updatedAt: now };
  const partial = legacyParticipationHistory(row);
  assert.equal(partial.firstJoinedAt, null); assert.equal(partial.lastJoinedAt, row.joinedAt); assert.equal(partial.lastLeftAt, now);
  assert.equal(partial.joinCount, 1); assert.equal(partial.leaveCount, 1); assert.equal(partial.historyComplete, false);
  const createdAt = new Date('2098-11-01'); assert.equal(legacyParticipationHistory(row, createdAt).firstJoinedAt, createdAt);
  for (const patch of [{ userId: 'invalid' }, { campusId: 'invalid' }, { status: 'UNKNOWN' }, { updatedAt: new Date('2090-01-01') }]) {
    assert.throws(() => legacyParticipationHistory({ ...row, ...patch } as ActivityParticipationDocument));
  }
});

test('explicit VIEWED is appended once per opening, never changes participation and revalidates visibility/campus', async () => {
  let activity: ActivityDocument = { _id: id, campusId, createdByUserId: userId, title: 'Actividad', description: 'Descripción', type: 'COMMUNITY_ACTIVITY',
    status: 'ACTIVE', visibility: 'PUBLIC', startAt: now, endAt: new Date('2099-01-02'), createdAt: now, updatedAt: now,
    participantCount: 1, location: { buildingKey: 'h', floorKey: 'f' } };
  const map = { campusId, status: 'ACTIVE', buildings: [{ id: 'h', name: 'H', floors: [{ id: 'f', name: 'Piso 1', pois: [] }] }] };
  let events: any[] = []; let stateAccesses = 0;
  const session = { withTransaction: async (callback: any) => {
    const snapshot = [...events]; try { return await callback(); } catch (error) { events = snapshot; throw error; }
  } };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (callback: any) => callback(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => {
    if (name === 'activity_participation') { stateAccesses++; throw new Error('VIEWED must not read/write participation'); }
    if (name === 'activity_interactions') return {
      findOne: async (filter: any) => events.find(event => event._id.toHexString() === filter._id.toHexString()) ?? null,
      insertOne: async (event: any, options: any) => { assert.equal(options.session, session); events.push(event); },
    };
    return { findOne: async () => name === 'activities' ? activity : map };
  });
  try {
    await view(campusId, id.toHexString(), userId, now, operationId);
    await view(campusId, id.toHexString(), userId, now, operationId);
    assert.equal(events.length, 1); assert.equal(events[0].type, 'VIEWED'); assert.deepEqual(events[0].occurredAt, now);
    await view(campusId, id.toHexString(), userId, now, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    assert.equal(events.length, 2); assert.equal(stateAccesses, 0); assert.equal(activity.participantCount, 1);
    activity = { ...activity, status: 'FINISHED' };
    await assert.rejects(view(campusId, id.toHexString(), userId, now, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), { status: 404 });
    assert.equal(events.length, 2);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('HTTP explicit views derive user/campus/time from the authenticated server context and reject fabricated events', async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([{ id: userId, campus_id: campusId, institucion_id: campusId,
      nombre_completo: 'Usuario', verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null, foto_path: null }]);
    return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/shared/http/error-handler.js');
  const app = express(); app.use(express.json()); app.use('/api/v1/activities', createActivitiesRouter({ now: () => now,
    getActiveMap: async () => ({ campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
      buildings: [{ id: 'h', name: 'H', floors: [{ id: 'f', name: 'Piso 1', pois: [] }] }] }),
    findActivity: async () => ({ _id: id, campusId, createdByUserId: userId, title: 'Actividad', description: 'Descripción',
      type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC', startAt: now, endAt: new Date('2099-01-02'),
      createdAt: now, updatedAt: now, participantCount: 1, location: { buildingKey: 'h', floorKey: 'f' } }),
    recordView: async (campus, activityId, user, at, operation) => {
      calls++; assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); assert.equal(user, userId);
      assert.equal(at, now); assert.equal(operation, operationId);
    } })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities/${id.toHexString()}/interactions`;
  const headers = { Authorization: 'Bearer interaction.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url, { method: 'POST' })).status, 401);
    for (const patch of [{ userId }, { campusId }, { type: 'JOINED' }, { occurredAt: now.toISOString() }]) {
      assert.equal((await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ type: 'VIEWED', operationId, ...patch }) })).status, 400);
    }
    const response = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ type: 'VIEWED', operationId }) });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(calls, 1);
    assert.deepEqual((await response.json()).data, { campusId, activityId: id.toHexString(), type: 'VIEWED', recorded: true });
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('metrics read the immutable event log with campus/time/type scope and report legacy observations separately', async () => {
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({ aggregate: (pipeline: any[]) => {
    assert.equal(name, 'activity_interactions'); assert.equal(pipeline[0].$match.campusId, campusId);
    assert.deepEqual(pipeline[0].$match.occurredAt, { $gte: now, $lt: new Date('2100-01-01') });
    return { toArray: async () => [{ _id: 'VIEWED', count: 8, legacy: 0 }, { _id: 'JOINED', count: 3, legacy: 1 }, { _id: 'LEFT', count: 1, legacy: 0 }] };
  } }));
  try {
    const { countActivityInteractions } = await import('../src/modules/analytics/analytics.repository.js');
    assert.deepEqual(await countActivityInteractions(campusId, now, new Date('2100-01-01')), { viewed: 8, joined: 3, left: 1, legacyEvents: 1 });
    await assert.rejects(countActivityInteractions(campusId, now, now));
  } finally { dbMock.mock.restore(); }
});

test('the event writer exposes insert-only behavior and rejects undeclared types', async () => {
  let inserted = 0;
  const dbMock = mock.method(Db.prototype, 'collection', () => ({ insertOne: async () => { inserted++; } }));
  try {
    const { getMongoDB: getMongoDb } = await import('../src/database/mongodb/client.js');
    await appendActivityInteraction(getMongoDb(), { activityId: id, campusId, userId, type: 'JOINED', occurredAt: now, eventKey: 'test', provenance: 'LIVE' });
    await assert.rejects(appendActivityInteraction(getMongoDb(), { activityId: id, campusId, userId, type: 'OTHER' as any, occurredAt: now, eventKey: 'test2', provenance: 'LIVE' }), { status: 400 });
    assert.equal(inserted, 1);
  } finally { dbMock.mock.restore(); }
});
