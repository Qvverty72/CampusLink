import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { ObjectId } from 'mongodb';
import type { PoolClient } from 'pg';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import type { NewActivityReport, ReportsDependencies } from '../src/modules/reports/reports.types.js';
import { parseActivityReport } from '../src/modules/reports/reports.validation.js';

const db = new PGlite();
const campusId = randomUUID(), otherCampus = randomUUID(), userId = randomUUID(), creatorId = randomUUID();
const id = new ObjectId(), now = new Date('2099-10-10T12:00:00Z');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Usuario', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} };
const map: CampusMapDocument = { _id: new ObjectId(), campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'hbuilding', name: 'Edificio H', floors: [{ id: 'hbuilding_floor2', meshName: 'mesh', name: 'Piso 2',
    pois: [{ poiKey: 'sala', name: 'Sala', isVisible: true }, { poiKey: 'hidden', name: 'Oculto', isVisible: false }] }] }] };
const document = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({
  _id: id, campusId, createdByUserId: creatorId, title: 'Título original', description: 'Descripción original',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2099-10-11T12:00:00Z'), endAt: new Date('2099-10-11T13:00:00Z'),
  location: { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2' }, participantCount: 3, editRevision: 2,
  createdAt: now, updatedAt: now, ...patch,
});
const transaction = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> =>
  db.transaction(client => operation(client as unknown as PoolClient));
let reportActivity: typeof import('../src/modules/reports/reports.service.js').reportActivity;
let saveActivityReport: typeof import('../src/modules/reports/reports.repository.js').saveActivityReport;
const deps = (value = document()): ReportsDependencies => ({ now: () => now,
  getActiveMap: async campus => { assert.equal(campus, campusId); return map; },
  findActivity: async (campus, activityId) => { assert.equal(campus, campusId); assert.equal(activityId, id.toHexString()); return value; },
  saveActivityReport: report => saveActivityReport(report, transaction),
});
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://reports-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  await db.exec(`CREATE TABLE public.campus(id uuid PRIMARY KEY);
    CREATE TABLE public.perfil_usuario(id uuid PRIMARY KEY,campus_id uuid REFERENCES public.campus(id),estado_cuenta text,deleted_at timestamptz);`);
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  const definition = /CREATE TABLE public\.reporte_contenido \([\s\S]*?\n\);/.exec(schema)?.[0];
  assert.ok(definition); await db.exec(definition);
  await db.query('INSERT INTO campus VALUES ($1),($2)', [campusId, otherCampus]);
  await db.query("INSERT INTO perfil_usuario VALUES ($1,$2,'ACTIVA',NULL)", [userId, campusId]);
  ({ reportActivity } = await import('../src/modules/reports/reports.service.js'));
  ({ saveActivityReport } = await import('../src/modules/reports/reports.repository.js'));
});
after(async () => { await db.close(); await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('report validation requires a bounded free-text reason, accepts optional description and rejects every identity/state/content override', () => {
  assert.deepEqual(parseActivityReport({ reason: '  Uso indebido  ', description: '  ' }), { success: true, data: { reason: 'Uso indebido' } });
  for (const input of [undefined, null, [], 'texto', {}, { reason: ' ' }, { reason: 42 }, { reason: 'x'.repeat(201) },
    { reason: 'Motivo', description: null }, { reason: 'Motivo', description: 'x'.repeat(2001) },
    ...['campusId', 'userId', 'status', 'snapshot', 'activityId', 'reportedAt'].map(key => ({ reason: 'Motivo', [key]: 'override' }))]) {
    assert.equal(parseActivityReport(input).success, false);
  }
  assert.equal(parseActivityReport({ reason: 'x'.repeat(200), description: 'x'.repeat(2000) }).success, true);
});

test('community and official reports use the common SQL table with server identities, database date and pending state', async () => {
  for (const type of ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT']) {
    const receipt = await reportActivity(auth, id.toHexString().toUpperCase(), { reason: '  Motivo  ', description: 'Detalles' }, deps(document({ type })));
    const row = (await db.query<Record<string, unknown>>('SELECT * FROM reporte_contenido WHERE id=$1', [receipt.id])).rows[0];
    assert.equal(row.reportante_id, userId); assert.equal(row.campus_id, campusId); assert.equal(row.entidad_id, id.toHexString());
    assert.equal(row.entidad_tipo, 'ACTIVIDAD'); assert.equal(row.motivo, 'Motivo'); assert.equal(row.descripcion, 'Detalles');
    assert.equal(row.estado_reporte, 'PENDIENTE'); assert.equal(row.resuelto_por_id, null); assert.equal(row.resuelto_en, null);
    assert.equal(receipt.reportedAt, new Date(row.reportado_en as string).toISOString());
    assert.deepEqual(Object.keys(receipt).sort(), ['activityId', 'campusId', 'id', 'reportedAt', 'status']);
  }
});

test('snapshot preserves reported content and occurrence after edits; submission does not mutate Mongo content/participation/history', async () => {
  const value = document({ seriesId: new ObjectId(), occurrenceIndex: 2, occurrenceCount: 3, originalStartAt: now,
    bannerUrl: 'https://example.invalid/banner.jpg', category: 'Cultura', tags: [' Música '],
    notificationEvents: [], changeHistory: [], location: { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2', poiKey: 'sala' } });
  const original = JSON.stringify(value);
  const receipt = await reportActivity(auth, id.toHexString(), { reason: "Motivo ' ; SELECT 1 --" }, deps(value));
  assert.equal(JSON.stringify(value), original);
  value.title = 'Editado'; value.description = 'Cambiado'; value.location.floorKey = 'otro'; value.editRevision = 3;
  const row = (await db.query<{ contenido_reportado_json: Record<string, any>; descripcion: string | null }>(
    'SELECT contenido_reportado_json,descripcion FROM reporte_contenido WHERE id=$1', [receipt.id])).rows[0];
  const snapshot = row.contenido_reportado_json;
  assert.equal(row.descripcion, null); assert.equal(snapshot.title, 'Título original'); assert.equal(snapshot.description, 'Descripción original');
  assert.equal(snapshot.location.floorKey, 'hbuilding_floor2'); assert.equal(snapshot.location.poiName, 'Sala');
  assert.equal(snapshot.series.index, 2); assert.equal(snapshot.revision, 2); assert.equal(snapshot.createdByUserId, creatorId);
  assert.deepEqual(snapshot.tags, ['Música']);
  for (const key of ['participation', 'participantCount', 'changeHistory', 'notificationEvents', 'seriesDefinition', 'reportante_id']) assert.equal(key in snapshot, false);
});

test('reporting cannot bypass campus, publication, expiry, malformed data or inactive location', async () => {
  let saves = 0;
  for (const patch of [{ campusId: otherCampus }, { status: 'HIDDEN' }, { visibility: 'PRIVATE' }, { type: 'OTHER' },
    { endAt: now }, { startAt: new Date('invalid') }, { _id: new ObjectId() },
    { location: { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2', poiKey: 'hidden' } }]) {
    await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'Motivo' }, { ...deps(document(patch)),
      saveActivityReport: async () => { saves++; throw new Error('Must not save'); } }), { status: 404 });
  }
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'Motivo' }, { ...deps(), findActivity: async () => null }), { status: 404 });
  assert.equal(saves, 0);
});

test('active institutional permission is required before reads; failure never writes an inaccessible report', async () => {
  let reads = 0;
  for (const profile of [{ ...auth.profile, estado_cuenta: 'SUSPENDIDA' }, { ...auth.profile, deleted_at: now.toISOString() },
    { ...auth.profile, verificado_en: null }]) {
    await assert.rejects(reportActivity({ ...auth, profile }, id.toHexString(), { reason: 'Motivo' }, {
      ...deps(), getActiveMap: async () => { reads++; return map; } }), { status: 403 });
  }
  assert.equal(reads, 0);
  await assert.rejects(reportActivity(auth, 'invalid', { reason: 'Motivo' }, deps()), { status: 400 });
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: '' }, deps()), { status: 400 });
});

test('SQL rechecks current profile campus/state at commit and rejects stale identity without inserting', async () => {
  const baseline = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count;
  for (const [campus, state, deleted] of [[otherCampus, 'ACTIVA', null], [campusId, 'SUSPENDIDA', null], [campusId, 'ACTIVA', now]]) {
    await db.query('UPDATE perfil_usuario SET campus_id=$2,estado_cuenta=$3,deleted_at=$4 WHERE id=$1', [userId, campus, state, deleted]);
    await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'Motivo' }, deps()), { status: 403 });
  }
  await db.query("UPDATE perfil_usuario SET campus_id=$2,estado_cuenta='ACTIVA',deleted_at=NULL WHERE id=$1", [userId, campusId]);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline);
});

test('SQL failure is rolled back; snapshot/participation are not changed and no success is fabricated', async () => {
  const value = document(); const original = JSON.stringify(value);
  const baseline = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count;
  const failAfterInsert = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> => transaction(async client => {
    await operation(client); throw new Error('Commit failed');
  });
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'Motivo' }, { ...deps(value),
    saveActivityReport: report => saveActivityReport(report, failAfterInsert) }), /Commit failed/);
  assert.equal(JSON.stringify(value), original);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline);
});

test('HTTP report is authenticated, scoped, validated and private; no admin/reportery privilege is required to send', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    return Response.json([]);
  };
  const { createReportsRouter } = await import('../src/modules/reports/reports.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  let saves = 0;
  const app = express(); app.use(express.json()); app.use('/api/v1/reports', createReportsRouter(false, {
    ...deps(), saveActivityReport: async (report: NewActivityReport) => { saves++; return saveActivityReport(report, transaction); },
  })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/reports/activities/${id.toHexString()}`;
  const headers = { Authorization: 'Bearer reports.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url, { method: 'POST' })).status, 401);
    for (const [target, body] of [[url + '?campusId=' + otherCampus, { reason: 'Motivo' }],
      [url.replace(id.toHexString(), 'invalid'), { reason: 'Motivo' }], [url, { reason: 'Motivo', userId: creatorId }],
      [url, { reason: 'Motivo', status: 'RESUELTO' }], [url, { reason: ' ' }]]) {
      assert.equal((await originalFetch(target as string, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(saves, 0);
    const response = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ reason: 'Prueba', description: 'Detalle' }) });
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const receipt = (await response.json()).data;
    assert.equal(receipt.campusId, campusId); assert.equal(receipt.activityId, id.toHexString()); assert.equal(receipt.status, 'PENDIENTE');
    assert.equal('snapshot' in receipt, false); assert.equal('userId' in receipt, false); assert.equal(saves, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
