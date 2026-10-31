import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { ObjectId } from 'mongodb';
import type { PoolClient } from 'pg';
import type { VerifiedAuthConnection } from '../src/modules/auth/types/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import type { NewActivityReport, ReportsDependencies } from '../src/modules/reports/reports.types.js';
import { ACTIVITY_REPORT_REASON_CODES, parseActivityReport, parseContentReport } from '../src/modules/reports/reports.validation.js';
import { ACTIVITY_REPORT_REASONS } from '../../frontendclink/src/features/activities/types/activityReport.js';

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
let getOwnActivityReport: typeof import('../src/modules/reports/reports.service.js').getOwnActivityReport;
let saveActivityReport: typeof import('../src/modules/reports/reports.repository.js').saveActivityReport;
let findOwnActivityReport: typeof import('../src/modules/reports/reports.repository.js').findOwnActivityReport;
const deps = (value = document(), requestedId = value._id.toHexString(), actor = auth): ReportsDependencies => ({ now: () => now,
  findValidCreators: async (campus, ids) => new Map((await db.query<{ id: string }>(
    `SELECT id FROM perfil_usuario WHERE campus_id=$1 AND estado_cuenta='ACTIVA' AND deleted_at IS NULL AND id=ANY($2::uuid[])`,
    [campus, ids])).rows.map(row => [row.id, 'Organizador'])),
  getActiveMap: async campus => { assert.equal(campus, campusId); return map; },
  findActivity: async (campus, activityId) => { assert.equal(campus, campusId); assert.equal(activityId, requestedId); return value; },
  saveActivityReport: report => saveActivityReport(report, actor, transaction),
  findOwnActivityReport: (user, campus, activity) => findOwnActivityReport({ ...actor, userId: user, campusId: campus, profile: { ...actor.profile, id: user, campus_id: campus } }, activity, transaction),
});
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://reports-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  await db.exec(`CREATE TABLE public.campus(id uuid PRIMARY KEY);
    CREATE TABLE public.perfil_usuario(id uuid PRIMARY KEY,campus_id uuid REFERENCES public.campus(id),
      institucion_id uuid,nombre_completo text,foto_path text,verificado_en timestamptz,estado_cuenta text,deleted_at timestamptz);
    CREATE TABLE public.rol(id uuid PRIMARY KEY,nombre text);
    CREATE TABLE public.usuario_rol(id uuid PRIMARY KEY,perfil_usuario_id uuid,rol_id uuid,campus_id uuid,revocado_en timestamptz);`);
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  const definition = /CREATE TABLE public\.reporte_contenido \([\s\S]*?\n\);/.exec(schema)?.[0];
  assert.ok(definition); await db.exec(definition);
  await db.query('INSERT INTO campus VALUES ($1),($2)', [campusId, otherCampus]);
  await db.query(`INSERT INTO perfil_usuario(id,campus_id,institucion_id,verificado_en,estado_cuenta)
    VALUES ($1,$2,$2,now(),'ACTIVA'),($3,$2,$2,now(),'ACTIVA')`, [userId, campusId, creatorId]);
  ({ reportActivity, getOwnActivityReport } = await import('../src/modules/reports/reports.service.js'));
  ({ saveActivityReport, findOwnActivityReport } = await import('../src/modules/reports/reports.repository.js'));
});
beforeEach(async () => { await db.exec('DELETE FROM reporte_contenido'); });
after(async () => { await db.close(); await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('report validation requires a bounded free-text reason, accepts optional description and rejects every identity/state/content override', () => {
  assert.deepEqual(parseContentReport({ reason: '  Uso indebido  ', description: '  ' }), { success: true, data: { reason: 'Uso indebido' } });
  for (const input of [undefined, null, [], 'texto', {}, { reason: ' ' }, { reason: 42 }, { reason: 'x'.repeat(201) },
    { reason: 'Motivo', description: null }, { reason: 'Motivo', description: 'x'.repeat(2001) },
    { reason: 'Motivo\u0000' }, { reason: 'Motivo', description: 'Detalle\u0000' },
    ...['campusId', 'userId', 'status', 'snapshot', 'activityId', 'reportedAt'].map(key => ({ reason: 'Motivo', [key]: 'override' }))]) {
    assert.equal(parseContentReport(input).success, false);
  }
  assert.equal(parseContentReport({ reason: 'x'.repeat(200), description: 'x'.repeat(2000) }).success, true);
});

test('activity reasons match the UI catalog, validate every code and reject free text without changing other report types', () => {
  assert.deepEqual(ACTIVITY_REPORT_REASONS.map(option => option.code), [...ACTIVITY_REPORT_REASON_CODES]);
  assert.equal(new Set(ACTIVITY_REPORT_REASON_CODES).size, ACTIVITY_REPORT_REASON_CODES.length);
  for (const reason of ACTIVITY_REPORT_REASON_CODES) {
    assert.deepEqual(parseActivityReport({ reason: `  ${reason}  `, description: '  Detalle  ' }),
      { success: true, data: { reason, description: 'Detalle' } });
    assert.deepEqual(parseActivityReport({ reason, description: '  ' }), { success: true, data: { reason } });
  }
  for (const input of [null, [], {}, { reason: '' }, { reason: 42 }, { reason: 'Spam' }, { reason: 'ACTIVITY_UNKNOWN' },
    { reason: 'activity_spam' }, { reason: 'ACTIVITY_SPAM', description: null },
    { reason: 'ACTIVITY_SPAM', description: 'x'.repeat(2001) }, { reason: 'ACTIVITY_SPAM', userId }]) {
    assert.equal(parseActivityReport(input).success, false);
  }
  assert.equal(parseActivityReport({ reason: 'ACTIVITY_OTHER', description: 'x'.repeat(2000) }).success, true);
  assert.equal(parseContentReport({ reason: 'Motivo libre de publicación o transacción' }).success, true);
});

test('unknown activity reasons fail before reading content or saving a report', async () => {
  let reads = 0, saves = 0;
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'Texto libre anterior' }, {
    ...deps(), getActiveMap: async () => { reads++; return map; },
    saveActivityReport: async () => { saves++; throw new Error('Must not save'); },
  }), { status: 400 });
  assert.equal(reads, 0); assert.equal(saves, 0);
});

test('SQL stores every catalog code for aggregation and preserves legacy free-text reports', async () => {
  const legacyReason = 'Texto libre anterior sin categoría';
  const legacy = await saveActivityReport({ reason: legacyReason, description: 'Antecedente histórico',
    activityId: new ObjectId().toHexString(), campusId, userId, snapshot: {} as NewActivityReport['snapshot'] }, auth, transaction);
  const original = (await db.query('SELECT * FROM reporte_contenido WHERE id=$1', [legacy.id])).rows[0];
  const ids: string[] = [];
  for (const reason of ACTIVITY_REPORT_REASON_CODES) {
    const value = document({ _id: new ObjectId() });
    const receipt = await reportActivity(auth, value._id.toHexString(), { reason }, deps(value));
    ids.push(receipt.id);
  }
  const groups = (await db.query<{ motivo: string; count: number }>(`SELECT motivo,count(*)::int AS count
    FROM reporte_contenido WHERE entidad_tipo='ACTIVIDAD' AND campus_id=$1 AND id=ANY($2::uuid[])
    GROUP BY motivo ORDER BY motivo`, [campusId, ids])).rows;
  assert.deepEqual(groups, [...ACTIVITY_REPORT_REASON_CODES].sort().map(motivo => ({ motivo, count: 1 })));
  assert.deepEqual((await db.query('SELECT * FROM reporte_contenido WHERE id=$1', [legacy.id])).rows[0], original);
  assert.equal((await db.query('SELECT descripcion FROM reporte_contenido WHERE id=$1', [ids[0]])).rows[0].descripcion, null);
});

test('community and official reports use the common SQL table with server identities, database date and pending state', async () => {
  for (const type of ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT']) {
    const value = document({ _id: new ObjectId(), type });
    const receipt = await reportActivity(auth, value._id.toHexString().toUpperCase(), { reason: '  ACTIVITY_SPAM  ', description: 'Detalles' }, deps(value));
    const row = (await db.query<Record<string, unknown>>('SELECT * FROM reporte_contenido WHERE id=$1', [receipt.id])).rows[0];
    assert.equal(row.reportante_id, userId); assert.equal(row.campus_id, campusId); assert.equal(row.entidad_id, value._id.toHexString());
    assert.equal(row.entidad_tipo, 'ACTIVIDAD'); assert.equal(row.motivo, 'ACTIVITY_SPAM'); assert.equal(row.descripcion, 'Detalles');
    assert.equal(row.estado_reporte, 'PENDIENTE'); assert.equal(row.resuelto_por_id, null); assert.equal(row.resuelto_en, null);
    assert.equal(receipt.reportedAt, new Date(row.reportado_en as string).toISOString());
    assert.equal(receipt.reason, 'ACTIVITY_SPAM'); assert.equal(receipt.description, 'Detalles');
    assert.deepEqual(Object.keys(receipt).sort(), ['activityId', 'campusId', 'description', 'id', 'reason', 'reportedAt', 'status']);
  }
});

test('snapshot preserves reported content and occurrence after edits; submission does not mutate Mongo content/participation/history', async () => {
  const value = document({ seriesId: new ObjectId(), occurrenceIndex: 2, occurrenceCount: 3, originalStartAt: now,
    bannerUrl: 'https://example.invalid/banner.jpg', category: 'Cultura', tags: [' Música '],
    notificationEvents: [], changeHistory: [], location: { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2', poiKey: 'sala' } });
  const original = JSON.stringify(value);
  const receipt = await reportActivity(auth, id.toHexString(), { reason: "ACTIVITY_FALSE_INFORMATION", description: "Motivo ' ; SELECT 1 --" }, deps(value));
  assert.equal(JSON.stringify(value), original);
  value.title = 'Editado'; value.description = 'Cambiado'; value.location.floorKey = 'otro'; value.editRevision = 3;
  const row = (await db.query<{ contenido_reportado_json: Record<string, any>; descripcion: string | null }>(
    'SELECT contenido_reportado_json,descripcion FROM reporte_contenido WHERE id=$1', [receipt.id])).rows[0];
  const snapshot = row.contenido_reportado_json;
  assert.equal(row.descripcion, "Motivo ' ; SELECT 1 --"); assert.equal(snapshot.title, 'Título original'); assert.equal(snapshot.description, 'Descripción original');
  assert.equal(snapshot.location.floorKey, 'hbuilding_floor2'); assert.equal(snapshot.location.poiName, 'Sala');
  assert.equal(snapshot.series.index, 2); assert.equal(snapshot.revision, 2); assert.equal(snapshot.createdByUserId, creatorId);
  assert.deepEqual(snapshot.tags, ['Música']);
  for (const key of ['participation', 'participantCount', 'changeHistory', 'notificationEvents', 'seriesDefinition', 'reportante_id']) assert.equal(key in snapshot, false);
});

test('repeated and simultaneous activity reports return the original receipt without overwriting content or creating duplicates', async () => {
  const value = document();
  const first = await reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM', description: 'Original' }, deps(value));
  const original = (await db.query('SELECT * FROM reporte_contenido WHERE id=$1', [first.id])).rows[0];
  const repeats = await Promise.all(Array.from({ length: 8 }, () => reportActivity(auth, id.toHexString(),
    { reason: 'ACTIVITY_OTHER', description: 'Otro intento' }, deps(document({ title: 'Editada' })))));
  for (const repeat of repeats) assert.deepEqual(repeat, first);
  assert.deepEqual((await db.query('SELECT * FROM reporte_contenido WHERE id=$1', [first.id])).rows[0], original);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, 1);
  // También compiten intentos que parten sin un registro previo.
  const other = document({ _id: new ObjectId() });
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => reportActivity(auth, other._id.toHexString(),
    { reason: 'ACTIVITY_OTHER' }, deps(other))));
  assert.equal(new Set(concurrent.map(receipt => receipt.id)).size, 1);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, 2);
});

test('own receipt is private, campus scoped and persistent after resolution; other users and occurrences may report', async () => {
  assert.equal(await getOwnActivityReport(auth, id.toHexString(), deps()), null);
  const first = await reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_OTHER' }, deps());
  assert.deepEqual(await getOwnActivityReport(auth, id.toHexString().toUpperCase(), deps()), first);
  const otherAuth = { ...auth, userId: creatorId, profile: { ...auth.profile, id: creatorId } };
  assert.equal(await getOwnActivityReport(otherAuth, id.toHexString(), deps(document(), undefined, otherAuth)), null);
  assert.equal(await findOwnActivityReport(auth, new ObjectId().toHexString(), transaction), null);
  const another = await reportActivity(otherAuth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps(document(), undefined, otherAuth));
  assert.notEqual(another.id, first.id);
  for (const status of ['EN_REVISION','RESUELTO','DESESTIMADO']) {
    await db.query('UPDATE reporte_contenido SET estado_reporte=$2 WHERE id=$1', [first.id, status]);
    const own = await getOwnActivityReport(auth, id.toHexString(), deps());
    assert.equal(own?.id, first.id); assert.equal(own?.reportedAt, first.reportedAt); assert.equal(own?.status, status);
    assert.deepEqual(await reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), own);
    assert.deepEqual(Object.keys(own!).sort(), ['activityId','campusId','description','id','reason','reportedAt','status']);
  }
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1', [userId, otherCampus]);
  try {
    const moved = { ...auth, campusId: otherCampus, profile: { ...auth.profile, campus_id: otherCampus } };
    assert.equal(await getOwnActivityReport(moved, id.toHexString(), deps()), null);
    await assert.rejects(getOwnActivityReport(auth, id.toHexString(), deps()), { status: 403 });
  } finally { await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1', [userId, campusId]); }
  for (const profile of [{ ...auth.profile, estado_cuenta: 'SUSPENDIDA' }, { ...auth.profile, verificado_en: null }]) {
    await assert.rejects(getOwnActivityReport({ ...auth, profile }, id.toHexString(), deps()), { status: 403 });
  }
});

test('legacy duplicate reports are retained and first receipt is selected without modifying history', async () => {
  const first = await reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_OTHER' }, deps());
  const duplicateId = randomUUID();
  await db.query(`INSERT INTO reporte_contenido(id,reportante_id,campus_id,entidad_tipo,entidad_id,motivo,reportado_en)
    SELECT $2,reportante_id,campus_id,entidad_tipo,entidad_id,'Motivo histórico',reportado_en+interval '1 second'
    FROM reporte_contenido WHERE id=$1`, [first.id, duplicateId]);
  const beforeRows = (await db.query('SELECT * FROM reporte_contenido ORDER BY id')).rows;
  assert.deepEqual(await getOwnActivityReport(auth, id.toHexString(), deps()), first);
  assert.deepEqual(await reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), first);
  assert.deepEqual((await db.query('SELECT * FROM reporte_contenido ORDER BY id')).rows, beforeRows);
});

test('reporting cannot bypass campus, publication, expiry, malformed data or inactive location', async () => {
  let saves = 0;
  for (const patch of [{ campusId: otherCampus }, { status: 'HIDDEN' }, { visibility: 'PRIVATE' }, { type: 'OTHER' },
    { endAt: now }, { startAt: new Date('invalid') }, { _id: new ObjectId() },
    { location: { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2', poiKey: 'hidden' } }]) {
    await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, { ...deps(document(patch), id.toHexString()),
      saveActivityReport: async () => { saves++; throw new Error('Must not save'); } }), { status: 404 });
  }
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, { ...deps(), findActivity: async () => null }), { status: 404 });
  assert.equal(saves, 0);
});

test('active institutional permission is required before reads; failure never writes an inaccessible report', async () => {
  let reads = 0;
  for (const profile of [{ ...auth.profile, estado_cuenta: 'SUSPENDIDA' }, { ...auth.profile, deleted_at: now.toISOString() },
    { ...auth.profile, verificado_en: null }]) {
    await assert.rejects(reportActivity({ ...auth, profile }, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, {
      ...deps(), getActiveMap: async () => { reads++; return map; } }), { status: 403 });
  }
  assert.equal(reads, 0);
  await assert.rejects(reportActivity(auth, 'invalid', { reason: 'ACTIVITY_SPAM' }, deps()), { status: 400 });
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: '' }, deps()), { status: 400 });
});

test('SQL rechecks current profile campus/state at commit and rejects stale identity without inserting', async () => {
  const baseline = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count;
  for (const [campus, state, deleted] of [[otherCampus, 'ACTIVA', null], [campusId, 'SUSPENDIDA', null], [campusId, 'ACTIVA', now]]) {
    await db.query('UPDATE perfil_usuario SET campus_id=$2,estado_cuenta=$3,deleted_at=$4 WHERE id=$1', [userId, campus, state, deleted]);
    await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), { status: 403 });
  }
  await db.query("UPDATE perfil_usuario SET campus_id=$2,estado_cuenta='ACTIVA',deleted_at=NULL WHERE id=$1", [userId, campusId]);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline);
});

test('activity reports revalidate verification, institution and campus roles from SQL rather than the earlier auth context', async () => {
  const roleId = randomUUID(), assignmentId = randomUUID();
  const baseline = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count;
  await db.query("INSERT INTO rol VALUES ($1,'USUARIO_AUTORIZADO')", [roleId]);
  await db.query('INSERT INTO usuario_rol VALUES ($1,$2,$3,$4,NULL)', [assignmentId, userId, roleId, campusId]);
  try {
    await db.query('UPDATE perfil_usuario SET verificado_en=NULL WHERE id=$1', [userId]);
    const authorized = { ...auth, profile: { ...auth.profile, verificado_en: null },
      roles: [{ id: roleId, name: 'USUARIO_AUTORIZADO', campusId }] };
    const receipt = await reportActivity(authorized, id.toHexString(), { reason: 'ACTIVITY_OTHER' }, deps());
    assert.equal(receipt.status, 'PENDIENTE');
    await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE id=$1', [assignmentId]);
    // La solicitud conserva verificación o rol anterior, pero el guardado debe usar el estado persistido.
    for (const actor of [auth, authorized]) {
      await assert.rejects(reportActivity(actor, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), { status: 403 });
    }
    await db.query('UPDATE usuario_rol SET revocado_en=NULL,campus_id=$2 WHERE id=$1', [assignmentId, otherCampus]);
    await assert.rejects(reportActivity(authorized, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), { status: 403 });
    await db.query('UPDATE perfil_usuario SET verificado_en=now(),institucion_id=$2 WHERE id=$1', [userId, otherCampus]);
    await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), { status: 403 });
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline + 1);
  } finally {
    await db.query('UPDATE perfil_usuario SET verificado_en=now(),institucion_id=$2 WHERE id=$1', [userId, campusId]);
    await db.query('DELETE FROM usuario_rol WHERE id=$1', [assignmentId]);
    await db.query('DELETE FROM rol WHERE id=$1', [roleId]);
  }
});

test('SQL failure is rolled back; snapshot/participation are not changed and no success is fabricated', async () => {
  const value = document(); const original = JSON.stringify(value);
  const baseline = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count;
  const failAfterInsert = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> => transaction(async client => {
    await operation(client); throw new Error('Commit failed');
  });
  await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, { ...deps(value),
    saveActivityReport: report => saveActivityReport(report, auth, failAfterInsert) }), { status: 503 });
  assert.equal(JSON.stringify(value), original);
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline);
});

test('existing receipts cannot bypass persisted authorization on either lookup or repeat submission', async () => {
  const first = await reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_OTHER' }, deps());
  const original = (await db.query('SELECT * FROM reporte_contenido WHERE id=$1', [first.id])).rows[0];
  for (const change of ["estado_cuenta='SUSPENDIDA'", 'verificado_en=NULL',
    `institucion_id='${otherCampus}'`, `campus_id='${otherCampus}'`, 'deleted_at=now()']) {
    try {
      await db.exec(`UPDATE perfil_usuario SET ${change} WHERE id='${userId}'`);
      await assert.rejects(findOwnActivityReport(auth, id.toHexString(), transaction), { status: 403 });
      await assert.rejects(reportActivity(auth, id.toHexString(), { reason: 'ACTIVITY_SPAM' }, deps()), { status: 403 });
      assert.deepEqual((await db.query('SELECT * FROM reporte_contenido WHERE id=$1', [first.id])).rows[0], original);
    } finally {
      await db.query(`UPDATE perfil_usuario SET estado_cuenta='ACTIVA',verificado_en=now(),institucion_id=$2,
        campus_id=$2,deleted_at=NULL WHERE id=$1`, [userId, campusId]);
    }
  }
  const roleId = randomUUID(), assignmentId = randomUUID();
  await db.query("INSERT INTO rol VALUES ($1,'USUARIO_AUTORIZADO')", [roleId]);
  await db.query('INSERT INTO usuario_rol VALUES ($1,$2,$3,$4,NULL)', [assignmentId, userId, roleId, campusId]);
  const authorized = { ...auth, profile: { ...auth.profile, verificado_en: null },
    roles: [{ id: roleId, name: 'USUARIO_AUTORIZADO', campusId }] };
  try {
    await db.query('UPDATE perfil_usuario SET verificado_en=NULL WHERE id=$1', [userId]);
    assert.deepEqual(await findOwnActivityReport(authorized, id.toHexString(), transaction), first);
    await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE id=$1', [assignmentId]);
    await assert.rejects(findOwnActivityReport(authorized, id.toHexString(), transaction), { status: 403 });
    await assert.rejects(reportActivity(authorized, id.toHexString(), { reason: 'ACTIVITY_SPAM' },
      deps(document(), undefined, authorized)), { status: 403 });
  } finally {
    await db.query('UPDATE perfil_usuario SET verificado_en=now() WHERE id=$1', [userId]);
    await db.query('DELETE FROM usuario_rol WHERE id=$1', [assignmentId]);
    await db.query('DELETE FROM rol WHERE id=$1', [roleId]);
  }
});

test('own receipt lookup sanitizes SQL failures instead of treating them as an absent report', async () => {
  const unavailable: typeof transaction = async () => { throw new Error('private SQL connection details'); };
  await assert.rejects(findOwnActivityReport(auth, id.toHexString(), unavailable), (error: any) => {
    assert.equal(error.status, 503); assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
    assert.doesNotMatch(error.message, /private|SQL|connection/); return true;
  });
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
  const { apiErrorHandler } = await import('../src/shared/http/error-handler.js');
  let saves = 0, loseCommit = false;
  const uncertainTransaction: typeof transaction = async operation => {
    const receipt = await transaction(operation);
    if (loseCommit) throw new Error('private SQL connection details');
    return receipt;
  };
  const app = express(); app.use(express.json()); app.use('/api/v1/reports', createReportsRouter(false, {
    ...deps(), findActivity: async (_campus, activityId) => document({ _id: new ObjectId(activityId) }),
    saveActivityReport: async (report: NewActivityReport) => { saves++; return saveActivityReport(report, auth, uncertainTransaction); },
  })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/reports/activities/${id.toHexString()}`;
  const headers = { Authorization: 'Bearer reports.test.token', 'Content-Type': 'application/json' };
  try {
    assert.equal((await originalFetch(url, { method: 'POST' })).status, 401);
    assert.equal((await originalFetch(url + '/own')).status, 401);
    assert.equal((await originalFetch(url + '/own?userId=' + creatorId, { headers })).status, 400);
    assert.equal((await originalFetch(url.replace(id.toHexString(), 'invalid') + '/own', { headers })).status, 400);
    const empty = await originalFetch(url + '/own', { headers });
    assert.equal(empty.status, 200); assert.equal((await empty.json()).data, null);
    for (const [target, body] of [[url + '?campusId=' + otherCampus, { reason: 'ACTIVITY_SPAM' }],
      [url.replace(id.toHexString(), 'invalid'), { reason: 'ACTIVITY_SPAM' }], [url, { reason: 'ACTIVITY_SPAM', userId: creatorId }],
      [url, { reason: 'ACTIVITY_SPAM', status: 'RESUELTO' }], [url, { reason: ' ' }],
      [url, { reason: 'Texto libre' }], [url, { reason: 'ACTIVITY_UNKNOWN' }],
      [url, { reason: 'ACTIVITY_SPAM\u0000' }], [url, { reason: 'ACTIVITY_SPAM', description: 'Detalle\u0000' }]]) {
      assert.equal((await originalFetch(target as string, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
    }
    assert.equal(saves, 0);
    const response = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ reason: 'ACTIVITY_OTHER', description: 'Detalle' }) });
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const receipt = (await response.json()).data;
    assert.equal(receipt.campusId, campusId); assert.equal(receipt.activityId, id.toHexString()); assert.equal(receipt.status, 'PENDIENTE');
    assert.equal('snapshot' in receipt, false); assert.equal('userId' in receipt, false); assert.equal(saves, 1);
    assert.equal(receipt.reason, 'ACTIVITY_OTHER'); assert.equal(receipt.description, 'Detalle');
    for (const field of ['contenido_reportado_json','fundamento_resolucion','medida_aplicada','resuelto_por_id']) {
      assert.equal(field in receipt, false);
    }
    const own = await originalFetch(url + '/own', { headers });
    assert.equal(own.status, 200); assert.equal(own.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await own.json()).data, receipt);
    const repeated = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ reason: 'ACTIVITY_SPAM' }) });
    assert.equal(repeated.status, 201); assert.deepEqual((await repeated.json()).data, receipt);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, 1);
    const baseline = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count;
    loseCommit = true;
    const uncertain = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ reason: 'ACTIVITY_OTHER' }) });
    assert.equal(uncertain.status, 503);
    assert.equal(uncertain.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await uncertain.text(), /private|SQL|connection/);
    assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline);
    loseCommit = false;
    const recovered = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ reason: 'ACTIVITY_SPAM' }) });
    assert.equal(recovered.status, 201); assert.deepEqual((await recovered.json()).data, receipt);
    // También se pierde el acuse del primer INSERT; reintentar recupera ese envío sin duplicarlo.
    const freshUrl = url.replace(id.toHexString(), new ObjectId().toHexString());
    loseCommit = true;
    const firstUncertain = await originalFetch(freshUrl, { method: 'POST', headers,
      body: JSON.stringify({ reason: 'ACTIVITY_DANGEROUS', description: 'Primer envío' }) });
    assert.equal(firstUncertain.status, 503); assert.doesNotMatch(await firstUncertain.text(), /private|SQL|connection/);
    const persisted = (await (await originalFetch(freshUrl + '/own', { headers })).json()).data;
    assert.equal(persisted.reason, 'ACTIVITY_DANGEROUS'); assert.equal(persisted.description, 'Primer envío');
    loseCommit = false;
    const retry = await originalFetch(freshUrl, { method: 'POST', headers, body: JSON.stringify({ reason: 'ACTIVITY_SPAM' }) });
    assert.equal(retry.status, 201); assert.deepEqual((await retry.json()).data, persisted);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte_contenido')).rows[0].count, baseline + 1);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
