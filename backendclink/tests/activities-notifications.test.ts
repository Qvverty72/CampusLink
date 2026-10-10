import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { Db, ObjectId } from 'mongodb';
import type { PoolClient } from 'pg';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { PendingActivityNotification } from '../src/modules/activities/activities.notifications.repository.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { ActivityChangeDocument } from '../src/modules/activities/activities.edit.types.js';
import { publicationNotifications, changeNotification, participantsAtChange } from '../src/modules/activities/activities.notifications.js';

const db = new PGlite();
const campusId = randomUUID(), otherCampus = randomUUID(), userId = randomUUID(), second = randomUUID(), foreign = randomUUID();
const suspended = randomUUID(), deleted = randomUUID(), id = new ObjectId(), now = new Date('2099-10-10T12:00:00Z');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Usuario', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} };
const transaction = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> =>
  db.transaction(client => operation(client as unknown as PoolClient));
const task = (type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED' = 'OFFICIAL_EVENT_PUBLISHED'): PendingActivityNotification => ({
  campusId, activityId: id.toHexString(), creatorId: userId, createdAt: now,
  event: { key: `activity:${id.toHexString()}:${randomUUID()}`, type, title: 'Evento',
    reasons: type === 'ACTIVITY_CHANGED' ? ['DATES_CHANGED', 'LOCATION_CHANGED'] : [], occurredAt: now, status: 'PENDING' },
});
let sql: typeof import('../src/modules/users/notifications.repository.js');
let operation: typeof import('../src/modules/users/notifications.service.js').ownNotificationOperation;
let dispatch: typeof import('../src/modules/activities/activities.notifications.worker.js').dispatchActivityNotifications;
const migration = () => readFile('src/database/supabase/migrations/f2_6_08_notificaciones.sql', 'utf8');
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://notification-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE public.campus(id uuid PRIMARY KEY);
    CREATE TABLE public.perfil_usuario(id uuid PRIMARY KEY,campus_id uuid REFERENCES public.campus(id),estado_cuenta text,deleted_at timestamptz);
    CREATE TABLE public.notificacion(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),destinatario_id uuid REFERENCES public.perfil_usuario(id),
      actividad_id text,tipo_notificacion text,titulo text,mensaje text NOT NULL,created_at timestamptz DEFAULT now(),leida_en timestamptz,deleted_at timestamptz);
    ALTER TABLE public.notificacion ENABLE ROW LEVEL SECURITY;`);
  await db.exec(await migration());
  await db.query('INSERT INTO campus VALUES ($1),($2)', [campusId, otherCampus]);
  for (const [user, campus, state, date] of [[userId, campusId, 'ACTIVA', null], [second, campusId, 'ACTIVA', null],
    [foreign, otherCampus, 'ACTIVA', null], [suspended, campusId, 'SUSPENDIDA', null], [deleted, campusId, 'ACTIVA', now]]) {
    await db.query('INSERT INTO perfil_usuario VALUES ($1,$2,$3,$4)', [user, campus, state, date]);
  }
  sql = await import('../src/modules/users/notifications.repository.js');
  ({ ownNotificationOperation: operation } = await import('../src/modules/users/notifications.service.js'));
  ({ dispatchActivityNotifications: dispatch } = await import('../src/modules/activities/activities.notifications.worker.js'));
});
after(async () => { await db.close(); await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('official fanout is campus-scoped, excludes inactive/deleted profiles and is idempotent after deletion', async () => {
  const event = task();
  await sql.deliverActivityNotification(event, null, transaction);
  await sql.deliverActivityNotification(event, null, transaction);
  const rows = (await db.query<{ id: string; destinatario_id: string }>('SELECT * FROM notificacion WHERE actividad_evento_clave=$1', [event.event.key])).rows;
  assert.deepEqual(rows.map(row => row.destinatario_id).sort(), [userId, second].sort());
  const own = rows.find(row => row.destinatario_id === userId)!;
  await operation(auth, { id: own.id, remove: true }, transaction);
  await operation(auth, { id: own.id, remove: true }, transaction);
  await sql.deliverActivityNotification(event, null, transaction);
  const after = (await db.query<{ deleted_at: Date | null }>('SELECT deleted_at FROM notificacion WHERE actividad_evento_clave=$1', [event.event.key])).rows;
  assert.equal(after.length, 2); assert.equal(after.filter(row => row.deleted_at).length, 1);
  const page = await operation(auth, {}, transaction);
  assert.ok('items' in page); assert.equal(page.items.some(row => row.id === own.id), false);
});

test('change delivery uses captured JOINED recipients, still validates current campus and does not broadcast an empty audience', async () => {
  const event = task('ACTIVITY_CHANGED');
  await sql.deliverActivityNotification(event, [userId, foreign, suspended, deleted], transaction);
  const rows = (await db.query<{ destinatario_id: string; mensaje: string }>('SELECT * FROM notificacion WHERE actividad_evento_clave=$1', [event.event.key])).rows;
  assert.deepEqual(rows.map(row => row.destinatario_id), [userId]); assert.match(rows[0].mensaje, /fechas, ubicación/);
  const empty = task('ACTIVITY_CHANGED'); await sql.deliverActivityNotification(empty, [], transaction);
  assert.equal((await db.query('SELECT id FROM notificacion WHERE actividad_evento_clave=$1', [empty.event.key])).rows.length, 0);
  assert.deepEqual(participantsAtChange([{ userId: userId, status: 'LEFT' }, { userId: second, status: 'JOINED' },
    { userId: second, status: 'JOINED' }], userId), [second]);
  assert.deepEqual(participantsAtChange([], userId), [userId]);
});

test('durable event keys distinguish occurrences/revisions; community creation emits no official publication', () => {
  const base = { _id: id, title: 'Título', type: 'OFFICIAL_EVENT' } as ActivityDocument;
  const first = publicationNotifications(base, now);
  assert.deepEqual(publicationNotifications(base, now), first);
  assert.notEqual(publicationNotifications({ ...base, _id: new ObjectId() }, now)[0].key, first[0].key);
  assert.deepEqual(publicationNotifications({ ...base, type: 'COMMUNITY_ACTIVITY' }, now), []);
  const history = { activityId: id, revision: 1, after: { title: 'Nuevo' }, notificationReasons: ['DATES_CHANGED'], changedAt: now } as ActivityChangeDocument;
  const changed = changeNotification(history, [userId]);
  assert.equal(changed.key, `activity:${id.toHexString()}:revision:1`); assert.deepEqual(changed.recipientIds, [userId]);
  assert.notEqual(changeNotification({ ...history, revision: 2 }, [userId]).key, changed.key);
});

test('failed delivery or post-commit acknowledgement remains pending; replay creates no duplicate notifications', async () => {
  const event = task('ACTIVITY_CHANGED'); let acknowledged = 0, failAck = true;
  const deps = { pending: async () => [event], participants: async () => [userId],
    deliver: (value: PendingActivityNotification, users: string[] | null) => sql.deliverActivityNotification(value, users, transaction),
    acknowledge: async () => { if (failAck) throw new Error('Mongo unavailable'); acknowledged++; } };
  assert.deepEqual(await dispatch(deps), { delivered: 0, failed: 1 });
  assert.equal(acknowledged, 0); failAck = false;
  assert.deepEqual(await dispatch(deps), { delivered: 1, failed: 0 });
  assert.equal((await db.query('SELECT id FROM notificacion WHERE actividad_evento_clave=$1', [event.event.key])).rows.length, 1);
  assert.deepEqual(await dispatch({ ...deps, deliver: async () => { throw new Error('SQL unavailable'); } }), { delivered: 0, failed: 1 });
  assert.equal(acknowledged, 1);
  assert.deepEqual(await dispatch(deps, () => true), { delivered: 0, failed: 0 });
});

test('owner query/read/delete never expose another user/campus, and current profile is rechecked in transaction', async () => {
  const event = task(); await sql.deliverActivityNotification(event, null, transaction);
  const ids = (await db.query<{ id: string; destinatario_id: string }>('SELECT id,destinatario_id FROM notificacion WHERE actividad_evento_clave=$1', [event.event.key])).rows;
  const own = ids.find(row => row.destinatario_id === userId)!.id, other = ids.find(row => row.destinatario_id === second)!.id;
  await assert.rejects(operation(auth, { id: other, remove: true }, transaction), { status: 404 });
  await assert.rejects(operation(auth, { id: other }, transaction), { status: 404 });
  await operation(auth, { id: own }, transaction); await operation(auth, { id: own }, transaction);
  const page = await operation(auth, {}, transaction); assert.ok('items' in page);
  assert.ok(page.items.find(row => row.id === own)?.readAt); assert.equal(page.items.some(row => row.id === other), false);
  assert.equal('destinatario_id' in page.items[0], false);
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1', [userId, otherCampus]);
  try { await assert.rejects(operation(auth, {}, transaction), { status: 403 }); }
  finally { await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1', [userId, campusId]); }
  await assert.rejects(operation({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } }, {}, transaction), { status: 403 });
});

test('cursor pagination retains all notices without duplicate/skipped rows, including a deleted cursor', async () => {
  for (let index = 0; index < 35; index++) {
    const event = task('ACTIVITY_CHANGED'); event.event.occurredAt = new Date(now.getTime() + index);
    await sql.deliverActivityNotification(event, [userId], transaction);
  }
  const first = await operation(auth, {}, transaction); assert.ok('items' in first); assert.equal(first.items.length, 30); assert.ok(first.nextCursor);
  await operation(auth, { id: first.nextCursor, remove: true }, transaction);
  const next = await operation(auth, { cursor: first.nextCursor }, transaction); assert.ok('items' in next);
  assert.ok(next.items.length > 0); assert.equal(next.nextCursor, null);
  assert.equal(next.items.some(row => first.items.some(old => old.id === row.id)), false);
});

test('migration repeats without data changes, and direct anonymous/authenticated clients cannot bypass API', async () => {
  const before = (await db.query('SELECT * FROM notificacion ORDER BY id')).rows;
  await db.exec(await migration()); assert.deepEqual((await db.query('SELECT * FROM notificacion ORDER BY id')).rows, before);
  for (const role of ['anon', 'authenticated']) {
    await db.exec('SET ROLE ' + role);
    try { await assert.rejects(db.query('SELECT * FROM public.notificacion'), /permission denied/); }
    finally { await db.exec('RESET ROLE'); }
  }
});

test('notification acknowledgement only marks its scoped event, retaining activity content/revision/history', async () => {
  const captured: unknown[] = [];
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => {
    assert.equal(name, 'activities'); return { updateOne: async (filter: unknown, update: unknown) => { captured.push(filter, update); } };
  });
  try {
    const event = task(); const { markNotificationDelivered } = await import('../src/modules/activities/activities.notifications.repository.js');
    await markNotificationDelivered(event);
    assert.deepEqual(captured[0], { _id: id, campusId, notificationEvents: { $elemMatch: { key: event.event.key, status: 'PENDING' } } });
    const update = captured[1] as { $set: Record<string, unknown> };
    assert.deepEqual(Object.keys(update.$set).sort(), ['notificationEvents.$.deliveredAt', 'notificationEvents.$.status']);
  } finally { dbMock.mock.restore(); }
});

test('HTTP inbox/read/delete require identity, reject overrides and return own data without cache', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]); return Response.json([]);
  };
  const { createNotificationsRouter } = await import('../src/modules/users/notifications.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json());
  app.use('/api/v1/users/me/notifications', createNotificationsRouter((identity, input) => operation(identity, input, transaction))); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/users/me/notifications`;
  const headers = { Authorization: 'Bearer notification.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url)).status, 401);
    for (const method of ['PUT', 'DELETE']) assert.equal((await originalFetch(url + '/' + randomUUID() + (method === 'PUT' ? '/read' : ''), { method })).status, 401);
    assert.equal((await originalFetch(url + '?campusId=' + otherCampus, { headers })).status, 400);
    assert.equal((await originalFetch(url + '?cursor=invalid', { headers })).status, 400);
    assert.equal((await originalFetch(url + '/' + randomUUID(), { method: 'DELETE', headers, body: JSON.stringify({ userId: second }) })).status, 400);
    const response = await originalFetch(url, { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const page = (await response.json()).data; assert.ok(page.items.length); assert.equal('destinatario_id' in page.items[0], false);
    const own = page.items[0].id;
    assert.equal((await originalFetch(url + '/' + own + '/read', { method: 'PUT', headers })).status, 200);
    assert.equal((await originalFetch(url + '/' + own, { method: 'DELETE', headers })).status, 200);
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
