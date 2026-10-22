import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), other = randomUUID(), foreign = randomUUID();
let auth: VerifiedAuthConnection, server: Server, base: string;
let reviews: typeof import('../src/modules/reports/reports.review.service.js');
let failSql = false;
let storageCalls = 0;
const transaction = <T>(operation: (client: PoolClient) => Promise<T>) => db.transaction(client => operation(client as unknown as PoolClient));
const bytes = Buffer.from('%PDF-test');

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://review-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_DB_URL: 'postgresql://postgres:test@review-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => ({ query: (sql: string, values: unknown[] = []) => {
    if (failSql && sql.includes('reporte_contenido')) throw new Error('private SQL password');
    return db.query(sql, values);
  }, release() {} }));
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'perfil_usuario', 'rol', 'usuario_rol', 'publicacion_recurso',
    'recurso_digital', 'archivo_publicacion', 'mensaje_solicitud', 'solicitud_recurso', 'transaccion_recurso', 'confirmacion_transaccion', 'reporte_contenido']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.query('INSERT INTO institucion(id,nombre) VALUES($1,$2),($3,$4)', [institution, 'Local', foreign, 'Externa']);
  await db.query('INSERT INTO campus(id,institucion_id,nombre) VALUES($1,$2,$3),($4,$2,$5),($6,$6,$7)', [campus, institution, 'Origen', other, 'Otra sede', foreign, 'Externo']);
  await db.exec("INSERT INTO rol(nombre) VALUES('ADMINISTRADOR'),('USUARIO_AUTORIZADO')");
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://review-test.invalid');
    if (url.pathname.startsWith('/storage/v1/object/digital-resources/')) {
      storageCalls++; assert.equal(new Headers(init?.headers).get('apikey'), 'sb_secret_test');
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf' } });
    }
    const token = new Headers(init?.headers).get('authorization');
    if (token !== 'Bearer review.token') return Response.json({ message: 'Invalid' }, { status: 401 });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: auth.userId, email: 'admin@duocuc.cl', email_confirmed_at: '2026-10-22T12:00:00Z' });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    const kind = url.pathname.endsWith('/usuario_rol') ? 'rol' : 'permiso';
    return Response.json((kind === 'rol' ? auth.roles : auth.permissions).map(row => ({ campus_id: row.campusId, [kind]: { id: row.id, nombre: row.name } })));
  };
  reviews = await import('../src/modules/reports/reports.review.service.js');
  const { createApp } = await import('../src/app.js'); server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/reports/campuses/';
});
beforeEach(async () => {
  failSql = false; storageCalls = 0;
  const userId = randomUUID();
  await db.query('INSERT INTO auth.users VALUES($1)', [userId]);
  await db.query("INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) VALUES($1,$2,$3,'Administrador',now())", [userId, institution, campus]);
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) SELECT $1,id,$2 FROM rol WHERE nombre='ADMINISTRADOR'", [userId, campus]);
  auth = { userId, campusId: campus, roles: [{ id: randomUUID(), name: 'ADMINISTRADOR', campusId: campus }], permissions: [], profile: {
    id: userId, institucion_id: institution, campus_id: campus, nombre_completo: 'Administrador', foto_path: null,
    verificado_en: '2026-10-22T12:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null } };
  await db.exec('DELETE FROM reporte_contenido');
});
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await (await import('../src/database/supabase/postgres.js')).closePostgres();
  mock.restoreAll(); await db.close();
});

async function report(type = 'ACTIVIDAD', at = campus, snapshot: unknown = { title: 'Actividad original', description: 'Contenido original', revision: 2 }) {
  const id = randomUUID(), entityId = type === 'ACTIVIDAD' ? '123456789012345678901234' : (snapshot as any)?.publication?.id ?? randomUUID();
  await db.query(`INSERT INTO reporte_contenido(id,reportante_id,campus_id,entidad_tipo,entidad_id,motivo,descripcion,contenido_reportado_json)
    VALUES($1,$2,$3,$4,$5,'Motivo privado','Detalles privados',$6::jsonb)`, [id, auth.userId, at, type, entityId, JSON.stringify(snapshot)]);
  return id;
}
async function digitalCase() {
  const publicationId = randomUUID(), fileId = randomUUID();
  await db.query(`INSERT INTO publicacion_recurso(id,propietario_id,campus_id,tipo_recurso,titulo,descripcion,modalidad,estado_publicacion)
    VALUES($1,$2,$3,'DIGITAL','Título actual','Editado','DONACION','DISPONIBLE')`, [publicationId, auth.userId, campus]);
  await db.query('INSERT INTO recurso_digital(publicacion_id) VALUES($1)', [publicationId]);
  const path = `${campus}/${auth.userId}/${publicationId}/${fileId}.pdf`;
  await db.query(`INSERT INTO archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo)
    VALUES($1,$2,'digital-resources',$3,'evidencia.pdf','application/pdf',$4,'RECURSO')`, [fileId, publicationId, path, bytes.length]);
  const snapshot = { publication: { id: publicationId, campus_id: campus, propietario_id: auth.userId, tipo_recurso: 'DIGITAL', titulo: 'Título original',
    files: [{ id: fileId, name: 'evidencia.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length }] } };
  return { id: await report('PUBLICACION_DIGITAL', campus, snapshot), publicationId, fileId, path, snapshot };
}
const http = (path: string, token = true) => originalFetch(base + path, { headers: token ? { Authorization: 'Bearer review.token' } : {} });

test('listing filters campus before stable pagination, exposes minimal content/reason/date/status without reporter or snapshot', async () => {
  const ids = [await report(), await report(), await report()]; await report('ACTIVIDAD', other);
  const first = await reviews.listReportReviews(auth, campus, { page: '1', limit: '2' }, transaction);
  const second = await reviews.listReportReviews(auth, campus, { page: '2', limit: '2' }, transaction);
  assert.equal(first.meta.hasMore, true); assert.equal(second.meta.hasMore, false);
  assert.deepEqual(new Set([...first.data, ...second.data].map(row => row.id)), new Set(ids));
  for (const entry of first.data) {
    assert.equal(entry.campusId, campus); assert.equal(entry.title, 'Actividad original'); assert.equal(entry.status, 'PENDIENTE');
    assert.equal(entry.reason, 'Motivo privado'); assert.ok(Number.isFinite(Date.parse(entry.reportedAt)));
    assert.deepEqual(Object.keys(entry).sort(), ['campusId', 'entityId', 'entityType', 'id', 'reason', 'reportedAt', 'status', 'title']);
  }
});
test('detail preserves original activity independent of Mongo visibility and does not advance the case state', async () => {
  const id = await report();
  const detail = await reviews.getReportReview(auth, campus, id, transaction);
  assert.equal(detail.snapshot?.title, 'Actividad original'); assert.equal(detail.snapshot?.revision, 2);
  assert.equal(detail.reporter.id, auth.userId); assert.equal(detail.description, 'Detalles privados');
  assert.equal(detail.currentPublication, null);
  assert.equal((await db.query<{ estado_reporte: string }>('SELECT estado_reporte FROM reporte_contenido WHERE id=$1', [id])).rows[0].estado_reporte, 'PENDIENTE');
});
test('detail keeps snapshot after publication edit/withdrawal, current state is separately labelled, no Storage identifiers exposed', async () => {
  const fixture = await digitalCase();
  await db.query("UPDATE publicacion_recurso SET titulo='Cambiado',estado_publicacion='CANCELADO',deleted_at=now() WHERE id=$1", [fixture.publicationId]);
  const detail = await reviews.getReportReview(auth, campus, fixture.id, transaction);
  assert.deepEqual(detail.snapshot, fixture.snapshot); assert.equal(detail.currentPublication?.title, 'Cambiado');
  assert.ok(detail.currentPublication?.deletedAt);
  assert.ok(!/storage_path|bucket_id|https:/.test(JSON.stringify(detail)));
});
test('current transaction exposes pertinent participants/status/confirmations while original agreement stays immutable', async () => {
  const fixture = await digitalCase(), transactionId = randomUUID(), receiverId = randomUUID();
  await db.query('INSERT INTO auth.users VALUES($1)', [receiverId]);
  await db.query("INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo) VALUES($1,$2,$3,'Receptor')", [receiverId, institution, campus]);
  // El esquema exige una solicitud real como antecedente del acuerdo.
  const requestId = randomUUID();
  await db.exec("INSERT INTO mensaje_solicitud(codigo,descripcion) VALUES('QA_REVISION','Me interesa') ON CONFLICT DO NOTHING");
  await db.query("INSERT INTO solicitud_recurso(id,publicacion_id,solicitante_id,codigo_mensaje) VALUES($1,$2,$3,'QA_REVISION')", [requestId, fixture.publicationId, receiverId]);
  await db.query(`INSERT INTO transaccion_recurso(id,publicacion_id,solicitud_id,propietario_id,receptor_id,modalidad_acordada,estado_transaccion)
    VALUES($1,$2,$3,$4,$5,'DONACION','COMPLETADA')`, [transactionId, fixture.publicationId, requestId, auth.userId, receiverId]);
  await db.query("INSERT INTO confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) VALUES($1,$2,'PROPIETARIO')", [transactionId, auth.userId]);
  await db.query(`UPDATE reporte_contenido SET entidad_tipo='TRANSACCION',entidad_id=$2,
    contenido_reportado_json=contenido_reportado_json||$3::jsonb WHERE id=$1`, [fixture.id, transactionId, JSON.stringify({ transaction: { id: transactionId, estado_transaccion: 'RESERVADA', propietario_id: auth.userId, receptor_id: receiverId } })]);
  const detail = await reviews.getReportReview(auth, campus, fixture.id, transaction);
  assert.equal(detail.snapshot?.transaction.estado_transaccion, 'RESERVADA'); assert.equal(detail.currentTransaction?.status, 'COMPLETADA');
  assert.deepEqual(detail.currentTransaction?.receiver, { id: receiverId, name: 'Receptor' });
  assert.equal((detail.currentTransaction?.confirmations as unknown[]).length, 1);
  assert.equal((await reviews.getReportedOriginal(auth, campus, fixture.id, fixture.fileId, transaction, async () => bytes)).bytes, bytes);
});
test('UUID and query manipulation cannot expose another campus or institution, even with a stale admin context', async () => {
  const id = await report('ACTIVIDAD', other);
  await assert.rejects(reviews.getReportReview(auth, campus, id, transaction), { status: 404 });
  for (const at of [other, foreign]) {
    await assert.rejects(reviews.listReportReviews(auth, at, {}, transaction), { status: 403 });
    await assert.rejects(reviews.getReportReview(auth, at, id, transaction), { status: 403 });
  }
  for (const query of [{ campusId: other }, { page: ['1'] }, { limit: '101' }, { page: '0' }, { page: '1;select 1' }, { status: 'PENDIENTE' }]) {
    await assert.rejects(reviews.listReportReviews(auth, campus, query, transaction), { status: 400 });
  }
});
test('explicit administration of a second campus works without transferring home-campus access', async () => {
  const id = await report('ACTIVIDAD', other);
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) SELECT $1,id,$2 FROM rol WHERE nombre='ADMINISTRADOR'", [auth.userId, other]);
  assert.equal((await reviews.getReportReview(auth, other, id, transaction)).id, id);
});
test('revoked role, suspension, deactivation, deleted account and reporting-only permission deny every protected read', async () => {
  const id = await report();
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE perfil_usuario_id=$1', [auth.userId]);
  auth.permissions = [{ id: randomUUID(), name: 'ACCEDER_REPORTERIA', campusId: campus }];
  await assert.rejects(reviews.getReportReview(auth, campus, id, transaction), { status: 403 });
  await db.query('UPDATE usuario_rol SET revocado_en=NULL WHERE perfil_usuario_id=$1', [auth.userId]);
  for (const state of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$2 WHERE id=$1', [auth.userId, state]);
    await assert.rejects(reviews.listReportReviews(auth, campus, {}, transaction), { status: 403 });
  }
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',deleted_at=now() WHERE id=$1", [auth.userId]);
  await assert.rejects(reviews.getReportReview(auth, campus, id, transaction), { status: 403 });
});
test('competent administrator can download snapshot original after withdrawal of resource and file, without granting acquisition', async () => {
  const fixture = await digitalCase();
  await db.query("UPDATE publicacion_recurso SET estado_publicacion='CANCELADO',deleted_at=now() WHERE id=$1", [fixture.publicationId]);
  await db.query('UPDATE archivo_publicacion SET deleted_at=now() WHERE id=$1', [fixture.fileId]);
  let downloads = 0;
  const result = await reviews.getReportedOriginal(auth, campus, fixture.id, fixture.fileId, transaction, async file => {
    downloads++; assert.equal(file.storage_path, fixture.path); return bytes;
  });
  assert.equal(result.bytes, bytes); assert.equal(result.name, 'evidencia.pdf'); assert.equal(downloads, 1);
});
test('unknown/other-case files and campus substitution never reach Storage', async () => {
  const fixture = await digitalCase(); let downloads = 0;
  const download = async () => { downloads++; return bytes; };
  await assert.rejects(reviews.getReportedOriginal(auth, campus, fixture.id, randomUUID(), transaction, download), { status: 404 });
  await assert.rejects(reviews.getReportedOriginal(auth, other, fixture.id, fixture.fileId, transaction, download), { status: 403 });
  const activity = await report();
  await assert.rejects(reviews.getReportedOriginal(auth, campus, activity, fixture.fileId, transaction, download), { status: 404 });
  assert.equal(downloads, 0);
});
test('Storage path substitution is rejected and authorization is rechecked after download', async () => {
  const fixture = await digitalCase();
  await db.query('UPDATE archivo_publicacion SET storage_path=$2 WHERE id=$1', [fixture.fileId, `other/${randomUUID()}.pdf`]);
  await assert.rejects(reviews.getReportedOriginal(auth, campus, fixture.id, fixture.fileId, transaction, async () => { throw new Error('Must not download'); }), { status: 404 });
  await db.query('UPDATE archivo_publicacion SET storage_path=$2 WHERE id=$1', [fixture.fileId, fixture.path]);
  await assert.rejects(reviews.getReportedOriginal(auth, campus, fixture.id, fixture.fileId, transaction, async () => {
    await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE perfil_usuario_id=$1', [auth.userId]); return bytes;
  }), { status: 403 });
});
test('Storage failures become safe 503 errors without SQL, bucket paths or credentials', async () => {
  const fixture = await digitalCase();
  await assert.rejects(reviews.getReportedOriginal(auth, campus, fixture.id, fixture.fileId, transaction, async () => { throw new Error('secret path/password'); }),
    error => (error as any).status === 503 && !/secret|password|storage_path/.test(String(error)));
});
test('HTTP protected file streams original bytes with safe headers; unrelated files and revoked role cannot download', async () => {
  const fixture = await digitalCase();
  const path = campus + '/' + fixture.id + '/files/' + fixture.fileId;
  const response = await http(path);
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename\*=UTF-8''evidencia.pdf/);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes); assert.equal(storageCalls, 1);
  assert.equal((await http(path + '?url=https://example.invalid')).status, 400);
  assert.equal((await http(campus + '/' + fixture.id + '/files/' + randomUUID())).status, 404);
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE perfil_usuario_id=$1', [auth.userId]);
  assert.equal((await http(path)).status, 403); assert.equal(storageCalls, 1);
});
test('physical report and every persisted case state are readable without changing original content or hiding publications', async () => {
  const publicationId = randomUUID();
  await db.query(`INSERT INTO publicacion_recurso(id,propietario_id,campus_id,tipo_recurso,titulo,descripcion,modalidad)
    VALUES($1,$2,$3,'FISICO','Libro editado','Actual','DONACION')`, [publicationId, auth.userId, campus]);
  const snapshot = { publication: { id: publicationId, tipo_recurso: 'FISICO', titulo: 'Libro original', images: [] } };
  const id = await report('PUBLICACION_FISICA', campus, snapshot);
  for (const status of ['PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO']) {
    await db.query('UPDATE reporte_contenido SET estado_reporte=$2 WHERE id=$1', [id, status]);
    const detail = await reviews.getReportReview(auth, campus, id, transaction);
    assert.equal(detail.status, status); assert.deepEqual(detail.snapshot, snapshot);
    assert.equal(detail.currentPublication?.title, 'Libro editado'); assert.equal(detail.currentPublication?.status, 'DISPONIBLE');
  }
});
test('inactive campus and malformed identifiers fail closed before reading a case', async () => {
  const id = await report();
  await db.query('UPDATE campus SET activo=false WHERE id=$1', [campus]);
  try { await assert.rejects(reviews.getReportReview(auth, campus, id, transaction), { status: 403 }); }
  finally { await db.query('UPDATE campus SET activo=true WHERE id=$1', [campus]); }
  await assert.rejects(reviews.getReportReview(auth, campus, '1 OR 1=1', transaction), { status: 400 });
});
test('HTTP enforces authentication, no-store, pagination envelope, campus isolation, validation and safe dependency errors', async () => {
  const id = await report();
  assert.equal((await http(campus, false)).status, 401);
  const listed = await http(campus + '?limit=1'); assert.equal(listed.status, 200);
  assert.match(listed.headers.get('cache-control') ?? '', /no-store/);
  const body = await listed.json(); assert.equal(body.data[0].id, id); assert.equal(body.meta.limit, 1);
  const detail = await http(campus + '/' + id); assert.equal(detail.status, 200); assert.equal((await detail.json()).data.reporter.id, auth.userId);
  assert.equal((await http(other + '/' + id)).status, 403);
  assert.equal((await http(campus + '/' + randomUUID())).status, 404);
  assert.equal((await http(campus + '/' + id + '?campusId=' + other)).status, 400);
  failSql = true;
  const failed = await http(campus); assert.equal(failed.status, 503);
  assert.ok(!/password|SELECT|reporte_contenido/.test(await failed.text()));
});
