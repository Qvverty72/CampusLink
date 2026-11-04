import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Pool, type PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { Db, ObjectId } from 'mongodb';
import type { VerifiedAuthConnection } from '../src/modules/auth/types/auth.types.js';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), other = randomUUID(), foreign = randomUUID();
let auth: VerifiedAuthConnection, server: Server, base: string;
let reviews: typeof import('../src/modules/reports/services/reports.review.service.js');
let resolutions: typeof import('../src/modules/reports/services/reports.resolution.service.js');
let failSql = false;
let failAudit = false, failMongo = false, mongoWrites = 0;
let activity: Record<string, any> | null = null;
let storageCalls = 0;
const transaction = <T>(operation: (client: PoolClient) => Promise<T>) => db.transaction(client => operation({
  query: (sql: string, values: unknown[]) => {
    if (failAudit && sql.includes('INSERT INTO public.auditoria')) throw new Error('private audit failure');
    return client.query(sql, values);
  },
} as PoolClient));
const bytes = Buffer.from('%PDF-test');

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://review-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_DB_URL: 'postgresql://postgres:test@review-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => ({ query: (sql: string, values: unknown[] = []) => {
    if (failSql && sql.includes('reporte_contenido')) throw new Error('private SQL password');
    return db.query(sql, values);
  }, release() {} }));
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'perfil_usuario', 'rol', 'usuario_rol', 'publicacion_recurso',
    'recurso_digital', 'archivo_publicacion', 'mensaje_solicitud', 'solicitud_recurso', 'transaccion_recurso', 'confirmacion_transaccion', 'acceso_recurso_digital', 'reporte_contenido', 'auditoria']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.query('INSERT INTO institucion(id,nombre) VALUES($1,$2),($3,$4)', [institution, 'Local', foreign, 'Externa']);
  await db.query('INSERT INTO campus(id,institucion_id,nombre) VALUES($1,$2,$3),($4,$2,$5),($6,$6,$7)', [campus, institution, 'Origen', other, 'Otra sede', foreign, 'Externo']);
  await db.exec("INSERT INTO rol(nombre) VALUES('ADMINISTRADOR'),('USUARIO_AUTORIZADO')");
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://review-test.invalid');
    if (url.pathname.startsWith('/storage/v1/object/sign/publication-images/')) {
      storageCalls++; assert.equal(new Headers(init?.headers).get('apikey'), 'sb_secret_test');
      assert.equal(JSON.parse(String(init?.body)).expiresIn, 60);
      return Response.json({ signedURL: url.pathname.replace('/storage/v1', '') + '?token=fixture-only' });
    }
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
  reviews = await import('../src/modules/reports/services/reports.review.service.js');
  resolutions = await import('../src/modules/reports/services/reports.resolution.service.js');
  mock.method(Db.prototype, 'collection', ((name: string) => {
    assert.equal(name, 'activities');
    return {
      async findOneAndUpdate(filter: any, update: any) {
        if (failMongo) throw new Error('private Mongo credentials');
        if (!activity || activity.campusId !== filter.campusId || activity._id.toHexString() !== filter._id.toHexString()
          || activity.visibility !== filter.visibility || activity.deletedAt != null) return null;
        mongoWrites++; Object.assign(activity, update.$set); activity.editRevision = (activity.editRevision ?? 0) + update.$inc.editRevision;
        return activity;
      },
      async findOne(filter: any) { return activity?.campusId === filter.campusId && activity?._id.toHexString() === filter._id.toHexString() ? activity : null; },
    };
  }) as typeof Db.prototype.collection);
  const { createApp } = await import('../src/app.js'); server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/reports/campuses/';
});
beforeEach(async () => {
  failSql = false; failAudit = false; failMongo = false; mongoWrites = 0; activity = null; storageCalls = 0;
  const userId = randomUUID();
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'admin-current@duocuc.cl')", [userId]);
  await db.query("INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) VALUES($1,$2,$3,'Administrador',now())", [userId, institution, campus]);
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) SELECT $1,id,$2 FROM rol WHERE nombre='ADMINISTRADOR'", [userId, campus]);
  auth = { userId, campusId: campus, roles: [{ id: randomUUID(), name: 'ADMINISTRADOR', campusId: campus }], permissions: [], profile: {
    id: userId, institucion_id: institution, campus_id: campus, nombre_completo: 'Administrador', foto_path: null,
    verificado_en: '2026-10-22T12:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null } };
  await db.exec('DELETE FROM auditoria; DELETE FROM reporte_contenido');
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
async function physicalCase() {
  const publicationId = randomUUID(), imageId = randomUUID(), path = `${campus}/${auth.userId}/${publicationId}/${imageId}.png`;
  await db.query(`INSERT INTO publicacion_recurso(id,propietario_id,campus_id,tipo_recurso,titulo,descripcion,modalidad,estado_publicacion)
    VALUES($1,$2,$3,'FISICO','Título actual','Contenido actual','DONACION','DISPONIBLE')`, [publicationId, auth.userId, campus]);
  await db.query(`INSERT INTO archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
    VALUES($1,$2,'publication-images',$3,'original.png','image/png',100,'IMAGEN',0)`, [imageId, publicationId, path]);
  const snapshot = { publication: { id: publicationId, tipo_recurso: 'FISICO', titulo: 'Título guardado', propietario_id: auth.userId,
    images: [{ id: imageId, nombre_original: 'original.png', url: 'https://untrusted.invalid/never', storage_path: 'never-use-snapshot-path' }] } };
  return { id: await report('PUBLICACION_FISICA', campus, snapshot), publicationId, imageId, path, snapshot };
}
const http = (path: string, token = true) => originalFetch(base + path, { headers: token ? { Authorization: 'Bearer review.token' } : {} });
const decision = { decision: 'ACOGER', justification: 'Contenido revisado y contrario al uso permitido.' };
const dismiss = { decision: 'DESESTIMAR', justification: 'Los antecedentes no acreditan el motivo denunciado.' };
const resolveCase = (id: string, input: unknown = decision, at = campus) => resolutions.resolveReport(auth, at, id, input, transaction);
const audits = async () => (await db.query<any>('SELECT * FROM auditoria')).rows;

async function contact(name: string, email: string | null) {
  const id = randomUUID();
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, email]);
  await db.query('INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo) VALUES($1,$2,$3,$4)', [id, institution, campus, name]);
  return { id, name, email };
}

test('reported images sign only the saved photo, including final/hidden/logically removed content, without changing historical data', async () => {
  const fixture = await physicalCase(), paths: string[] = [];
  const sign = async (path: string) => { paths.push(path); return 'https://review-test.invalid/signed?token=private'; };
  await db.query("UPDATE publicacion_recurso SET titulo='Contenido editado',estado_publicacion='OCULTO',deleted_at=now() WHERE id=$1", [fixture.publicationId]);
  await db.query("UPDATE archivo_publicacion SET nombre_original='nombre-actual.png',deleted_at=now() WHERE id=$1", [fixture.imageId]);
  for (const status of ['PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO']) {
    await db.query('UPDATE reporte_contenido SET estado_reporte=$2 WHERE id=$1', [fixture.id, status]);
    assert.deepEqual(await reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, sign), { url: 'https://review-test.invalid/signed?token=private', expiresIn: 60 });
    assert.deepEqual((await reviews.getReportReview(auth, campus, fixture.id, transaction)).snapshot, fixture.snapshot);
  }
  assert.deepEqual(paths, Array(4).fill(fixture.path)); assert.equal((await audits()).length, 0);
  const agreementId = randomUUID();
  await db.query("UPDATE reporte_contenido SET entidad_tipo='TRANSACCION',entidad_id=$2,contenido_reportado_json=contenido_reportado_json||$3::jsonb WHERE id=$1",
    [fixture.id, agreementId, JSON.stringify({ transaction: { id: agreementId } })]);
  await reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, sign);
  await db.query('UPDATE reporte_contenido SET entidad_id=$2 WHERE id=$1', [fixture.id, randomUUID()]);
  await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, sign), { status: 404 });
});

test('reported images reject new/live-only photos, other campuses, mismatched publication and unsafe file storage references', async () => {
  const fixture = await physicalCase(); let signs = 0;
  const sign = async () => { signs++; return 'https://review-test.invalid/signed'; };
  await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, randomUUID(), transaction, sign), { status: 404 });
  for (const [column, value] of [['bucket_id', 'digital-resources'], ['mime_type', 'application/pdf'], ['tipo_archivo', 'RECURSO'],
    ['storage_path', `${other}/private.png`], ['storage_path', `${campus}/../private.png`], ['storage_path', `${campus}/%2e%2e/private.png`], ['storage_path', `${campus}/image.png?token=bad`]]) {
    // Columnas estáticas de esta prueba; ningún identificador SQL procede de una petición.
    await db.query(`UPDATE archivo_publicacion SET ${column}=$2 WHERE id=$1`, [fixture.imageId, value]);
    await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, sign), { status: 404 });
    await db.query("UPDATE archivo_publicacion SET bucket_id='publication-images',mime_type='image/png',tipo_archivo='IMAGEN',storage_path=$2 WHERE id=$1", [fixture.imageId, fixture.path]);
  }
  await db.query('UPDATE publicacion_recurso SET campus_id=$2 WHERE id=$1', [fixture.publicationId, other]);
  await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, sign), { status: 404 });
  await db.query('UPDATE publicacion_recurso SET campus_id=$2 WHERE id=$1', [fixture.publicationId, campus]);
  await db.query('UPDATE reporte_contenido SET entidad_id=$2 WHERE id=$1', [fixture.id, randomUUID()]);
  await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, sign), { status: 404 });
  assert.equal(signs, 0);
});

test('image signing sanitizes dependency failures and rechecks current access and file association before exposing a URL', async () => {
  const fixture = await physicalCase();
  await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, async () => { throw new Error('private Storage credentials'); }),
    error => (error as any).status === 503 && !/credentials|Storage/.test((error as Error).message));
  await assert.rejects(reviews.getReportedImage(auth, campus, fixture.id, fixture.imageId, transaction, async () => {
    await db.query('DELETE FROM usuario_rol WHERE perfil_usuario_id=$1', [auth.userId]);
    return 'https://review-test.invalid/must-not-return';
  }), { status: 403 });
});

test('image HTTP is private/no-store, rejects malformed IDs/query or wrong campus and uses the existing signed Storage transport', async () => {
  const fixture = await physicalCase(), path = `${campus}/${fixture.id}/images/${fixture.imageId}`;
  assert.equal((await http(path, false)).status, 401);
  for (const target of [path + '?url=anything', `${campus}/${fixture.id}/images/invalid`]) assert.equal((await http(target)).status, 400);
  assert.equal((await http(`${other}/${fixture.id}/images/${fixture.imageId}`)).status, 403);
  const response = await http(path); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.json(); assert.equal(body.data.expiresIn, 60); assert.match(body.data.url, /^https:\/\/review-test.invalid\/storage\/v1\/object\/sign\/publication-images\//);
  assert.equal(storageCalls, 1); assert.ok(!/bucket_id|storage_path|nombre-actual/.test(JSON.stringify(body)));
});

test('authorized detail adds minimal current contacts from original case IDs, including decision response, without exposing them in lists', async () => {
  const owner = await contact('Dueña original', 'owner@duocuc.cl');
  const id = await report('PUBLICACION_FISICA', campus, { publication: { id: randomUUID(), titulo: 'Original', propietario_id: owner.id } });
  const detail = await reviews.getReportReview(auth, campus, id, transaction);
  assert.deepEqual(detail.people, { source: 'CURRENT_PROFILE', reporter: { id: auth.userId, name: 'Administrador', email: 'admin-current@duocuc.cl' }, reported: owner, decisionMaker: null });
  const result = await resolveCase(id, dismiss);
  assert.deepEqual(result.people?.decisionMaker, detail.people.reporter);
  const response = await http(campus + '/' + id);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const closed = (await response.json()).data;
  assert.deepEqual(closed.people, result.people); assert.equal(closed.reporter.name, null);
  assert.equal(closed.resolution.resolvedById, auth.userId); assert.deepEqual(closed.snapshot, detail.snapshot);
  for (const list of [await reviews.listReportReviews(auth, campus, {}, transaction), await reviews.listReportResolutions(auth, campus, {}, transaction)]) {
    assert.ok(!/people|owner@|admin-current@/.test(JSON.stringify(list)));
  }
  assert.equal((await http(campus + '/' + id + '?userId=' + owner.id)).status, 400);
  assert.equal((await http(other + '/' + id)).status, 403);
});

test('people never replace saved evidence and use saved publication owner or activity creator even after profile changes or removal', async () => {
  const fixture = await digitalCase(), owner = await contact('Dueño al leer', 'before@duocuc.cl');
  await db.query('UPDATE reporte_contenido SET contenido_reportado_json=contenido_reportado_json||$2::jsonb WHERE id=$1',
    [fixture.id, JSON.stringify({ publication: { ...fixture.snapshot.publication, propietario_id: owner.id } })]);
  await db.query("UPDATE publicacion_recurso SET propietario_id=$2,titulo='Contenido vivo ajeno' WHERE id=$1", [fixture.publicationId, auth.userId]);
  const before = await reviews.getReportReview(auth, campus, fixture.id, transaction);
  assert.deepEqual(before.people?.reported, owner);
  await db.query("UPDATE perfil_usuario SET nombre_completo='Nombre vigente',deleted_at=now(),estado_cuenta='DESACTIVADA',campus_id=$2 WHERE id=$1", [owner.id, other]);
  await db.query("UPDATE auth.users SET email='after@duocuc.cl' WHERE id=$1", [owner.id]);
  const after = await reviews.getReportReview(auth, campus, fixture.id, transaction);
  assert.deepEqual(after.snapshot, before.snapshot);
  assert.deepEqual(after.people?.reported, { id: owner.id, name: 'Nombre vigente', email: 'after@duocuc.cl' });
  const activityId = await report('ACTIVIDAD', campus, { title: 'Actividad original', createdByUserId: owner.id });
  assert.deepEqual((await reviews.getReportReview(auth, campus, activityId, transaction)).people?.reported, after.people?.reported);
  const missing = randomUUID(), legacy = await report('ACTIVIDAD', campus, { title: 'Legado', createdByUserId: missing });
  assert.deepEqual((await reviews.getReportReview(auth, campus, legacy, transaction)).people?.reported, { id: missing, name: null, email: null });
});

test('transaction reported person is the other saved participant for either reporting role; ambiguous legacy records do not guess an owner', async () => {
  const owner = await contact('Propietaria', 'owner-trade@duocuc.cl'), receiver = await contact('Receptor', null);
  for (const [reporterId, expected] of [[owner.id, receiver], [receiver.id, owner]] as const) {
    const id = await report('TRANSACCION', campus, { transaction: { propietario_id: owner.id, receptor_id: receiver.id }, publication: { propietario_id: owner.id } });
    await db.query('UPDATE reporte_contenido SET reportante_id=$2 WHERE id=$1', [id, reporterId]);
    assert.deepEqual((await reviews.getReportReview(auth, campus, id, transaction)).people?.reported, expected);
  }
  for (const agreement of [null, [], { propietario_id: owner.id, receptor_id: receiver.id },
    { propietario_id: auth.userId, receptor_id: auth.userId }, { propietario_id: auth.userId, receptor_id: 'invalid UUID' }]) {
    const id = await report('TRANSACCION', campus, { transaction: agreement, publication: { propietario_id: owner.id } });
    assert.equal((await reviews.getReportReview(auth, campus, id, transaction)).people?.reported, null);
  }
});

test('resolution history includes only final cases and paginates by original decision date then UUID within the campus', async () => {
  const first = await report(), second = await report(), pending = await report(), staged = await report(), outside = await report('ACTIVIDAD', other);
  for (const [id, status, at] of [[first, 'DESESTIMADO', '2026-10-21T12:00:00.123456Z'],
    [second, 'RESUELTO', '2026-10-22T12:00:00.123456Z'], [outside, 'RESUELTO', '2026-10-23T12:00:00Z'],
    [staged, 'EN_REVISION', '2026-10-24T12:00:00Z']]) {
    await db.query(`UPDATE reporte_contenido SET estado_reporte=$2,resuelto_en=$3,resuelto_por_id=$4,
      fundamento_resolucion='Decisión original',medida_aplicada='OCULTAR' WHERE id=$1`, [id, status, at, auth.userId]);
  }
  // Older report can have the newer resolution; reportedAt must not determine order.
  await db.query("UPDATE reporte_contenido SET reportado_en='2020-01-01Z' WHERE id=$1", [second]);
  let result = await reviews.listReportResolutions(auth, campus, { limit: '1' }, transaction);
  assert.deepEqual(result.data.map(row => row.id), [second]); assert.equal(result.meta.hasMore, true);
  result = await reviews.listReportResolutions(auth, campus, { limit: '1', page: '2' }, transaction);
  assert.deepEqual(result.data.map(row => row.id), [first]); assert.equal(result.meta.hasMore, false);
  for (const id of [pending, staged, outside, randomUUID()]) await assert.rejects(reviews.getReportResolution(auth, campus, id, transaction), { status: 404 });
  await db.query('UPDATE reporte_contenido SET resuelto_en=$1 WHERE id=ANY($2::uuid[])', ['2026-10-22T12:00:00.123456Z', [first, second]]);
  result = await reviews.listReportResolutions(auth, campus, {}, transaction);
  assert.deepEqual(result.data.map(row => row.id), [first, second].sort().reverse());
  assert.equal((await audits()).length, 0); assert.equal(mongoWrites, 0); assert.equal(storageCalls, 0);
});

test('history preserves the complete original decision after edits, logical removal, actor suspension and reporter relocation', async () => {
  const fixture = await digitalCase(), original = await resolveCase(fixture.id);
  const before = await reviews.getReportResolution(auth, campus, fixture.id, transaction);
  const reader = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [reader]);
  await db.query(`INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en)
    VALUES($1,$2,$3,'Nuevo lector',now())`, [reader, institution, campus]);
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) SELECT $1,id,$2 FROM rol WHERE nombre='ADMINISTRADOR'", [reader, campus]);
  await db.query("UPDATE publicacion_recurso SET titulo='Reemplazo actual',estado_publicacion='CANCELADO',deleted_at=now() WHERE id=$1", [fixture.publicationId]);
  await db.query("UPDATE perfil_usuario SET nombre_completo='Nombre cambiado',estado_cuenta='DESACTIVADA',deleted_at=now(),campus_id=$2 WHERE id=$1", [auth.userId, other]);
  const nextReader = { ...auth, userId: reader };
  const after = await reviews.getReportResolution(nextReader, campus, fixture.id, transaction);
  const { people: beforePeople, ...beforeRecord } = before, { people: afterPeople, ...afterRecord } = after;
  assert.deepEqual(afterRecord, beforeRecord); assert.deepEqual(after.resolution, original.resolution);
  assert.equal(beforePeople?.decisionMaker?.name, 'Administrador');
  assert.equal(afterPeople?.decisionMaker?.name, 'Nombre cambiado');
  assert.equal(afterPeople?.decisionMaker?.id, original.resolution?.resolvedById);
  assert.equal(afterPeople?.source, 'CURRENT_PROFILE');
  assert.deepEqual(after.snapshot, fixture.snapshot); assert.equal(after.title, 'Título original');
  assert.equal(after.reason, 'Motivo privado'); assert.equal(after.currentPublication, null); assert.equal(after.currentTransaction, null);
  assert.equal(after.reporter.name, null); assert.equal(after.resolution!.resolvedById, auth.userId);
  assert.equal((await reviews.listReportResolutions(nextReader, campus, {}, transaction)).data[0].id, fixture.id);
  assert.equal((await audits()).length, 1); assert.equal(storageCalls, 0);
});

test('history supports dismissed missing targets, activities and transactions without consulting their live state', async () => {
  for (const type of ['PUBLICACION_FISICA', 'TRANSACCION', 'ACTIVIDAD', 'COMPORTAMIENTO']) {
    const id = await report(type); const result = await resolveCase(id, dismiss);
    const detail = await reviews.getReportResolution(auth, campus, id, transaction);
    assert.equal(detail.entityType, type); assert.deepEqual(detail.resolution, result.resolution);
    assert.equal(detail.status, 'DESESTIMADO'); assert.equal(detail.currentPublication, null); assert.equal(detail.currentTransaction, null);
  }
  assert.equal((await reviews.listReportResolutions(auth, campus, {}, transaction)).data.length, 4);
});

test('legacy final rows expose only registered values without inventing a date, administrator, justification or measure', async () => {
  const id = await report(); await db.query("UPDATE reporte_contenido SET estado_reporte='RESUELTO' WHERE id=$1", [id]);
  const detail = await reviews.getReportResolution(auth, campus, id, transaction);
  assert.deepEqual(detail.resolution, { justification: null, measure: null, resolvedAt: null, resolvedById: null });
});

test('history enforces fresh campus roles and account state on both list and detail, including explicit second-campus assignments', async () => {
  const id = await report('ACTIVIDAD', other);
  await db.query("UPDATE reporte_contenido SET estado_reporte='DESESTIMADO' WHERE id=$1", [id]);
  await assert.rejects(reviews.listReportResolutions(auth, other, {}, transaction), { status: 403 });
  await assert.rejects(reviews.getReportResolution(auth, other, id, transaction), { status: 403 });
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) SELECT $1,id,$2 FROM rol WHERE nombre='ADMINISTRADOR'", [auth.userId, other]);
  assert.equal((await reviews.getReportResolution(auth, other, id, transaction)).id, id);
  assert.equal((await reviews.listReportResolutions(auth, other, {}, transaction)).data.length, 1);
  assert.equal((await reviews.listReportResolutions(auth, campus, {}, transaction)).data.length, 0);
  await assert.rejects(reviews.getReportResolution(auth, campus, id, transaction), { status: 404 });
  await assert.rejects(reviews.listReportResolutions(auth, foreign, {}, transaction), { status: 403 });
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE perfil_usuario_id=$1', [auth.userId]);
  auth.permissions = [{ id: randomUUID(), name: 'ACCEDER_REPORTERIA', campusId: other }];
  await assert.rejects(reviews.listReportResolutions(auth, other, {}, transaction), { status: 403 });
  await assert.rejects(reviews.getReportResolution(auth, other, id, transaction), { status: 403 });
  await db.query('UPDATE usuario_rol SET revocado_en=NULL WHERE perfil_usuario_id=$1', [auth.userId]);
  for (const status of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$2 WHERE id=$1', [auth.userId, status]);
    await assert.rejects(reviews.listReportResolutions(auth, other, {}, transaction), { status: 403 });
    await assert.rejects(reviews.getReportResolution(auth, other, id, transaction), { status: 403 });
  }
});

test('history HTTP uses private no-store envelopes, validates parameters and sanitizes errors', async () => {
  const id = await report(); await resolveCase(id, dismiss);
  const path = campus + '/resolutions';
  assert.equal((await http(path, false)).status, 401);
  const list = await http(path + '?limit=1'); assert.equal(list.status, 200); assert.match(list.headers.get('cache-control') ?? '', /no-store/);
  const body = await list.json(); assert.equal(body.data[0].id, id); assert.equal(body.data[0].resolution.measure, 'NINGUNA');
  assert.equal(body.data[0].resolution.resolvedById, auth.userId); assert.equal(body.meta.hasMore, false);
  const detail = await http(path + '/' + id); assert.equal(detail.status, 200); assert.equal((await detail.json()).data.reason, 'Motivo privado');
  for (const query of ['campusId=' + other, 'status=PENDIENTE', 'limit=101', 'page=0', 'page=1&page=2']) assert.equal((await http(path + '?' + query)).status, 400);
  assert.equal((await http(path + '/' + id + '?page=1')).status, 400);
  assert.equal((await http(path + '/invalid')).status, 400);
  assert.equal((await http('invalid/resolutions')).status, 400);
  assert.equal((await http(path + '/' + randomUUID())).status, 404);
  failSql = true;
  for (const target of [path, path + '/' + id]) {
    const failed = await http(target); assert.equal(failed.status, 503); assert.ok(!/password|SELECT|reporte_contenido/.test(await failed.text()));
  }
});

test('dismissal persists original case and final decision with responsible admin, campus, timestamp and immutable audit', async () => {
  const fixture = await digitalCase();
  const result = await resolveCase(fixture.id, { ...dismiss, justification: '  No corresponde.  ' });
  assert.equal(result.status, 'DESESTIMADO'); assert.equal(result.resolution?.justification, 'No corresponde.');
  assert.equal(result.resolution?.measure, 'NINGUNA'); assert.equal(result.resolution?.resolvedById, auth.userId);
  assert.ok(Number.isFinite(Date.parse(result.resolution!.resolvedAt))); assert.deepEqual(result.snapshot, fixture.snapshot);
  assert.equal(result.currentPublication?.status, 'DISPONIBLE');
  const [audit] = await audits(); assert.equal(audit.accion, 'DESESTIMAR_DENUNCIA'); assert.equal(audit.actor_usuario_id, auth.userId);
  assert.equal(audit.campus_id, campus); assert.equal(audit.institucion_id, institution); assert.equal(audit.reporte_contenido_id, fixture.id);
  assert.equal(audit.datos_antes.estado_reporte, 'PENDIENTE'); assert.equal(audit.datos_despues.fundamento_resolucion, 'No corresponde.');
  await db.query("UPDATE publicacion_recurso SET titulo='Editado después',deleted_at=now() WHERE id=$1", [fixture.publicationId]);
  assert.deepEqual((await reviews.getReportReview(auth, campus, fixture.id, transaction)).resolution, result.resolution);
  for (const input of [decision, dismiss]) await assert.rejects(resolveCase(fixture.id, input), { status: 409 });
  assert.equal((await audits()).length, 1);
});

test('upheld physical and digital publications are hidden, evidence and originals remain and dismissal needs no live target', async () => {
  for (const type of ['PUBLICACION_DIGITAL', 'PUBLICACION_FISICA']) {
    const fixture = await digitalCase();
    if (type === 'PUBLICACION_FISICA') {
      await db.query("UPDATE publicacion_recurso SET tipo_recurso='FISICO',estado_publicacion='RESERVADO' WHERE id=$1", [fixture.publicationId]);
      await db.query("UPDATE reporte_contenido SET entidad_tipo='PUBLICACION_FISICA' WHERE id=$1", [fixture.id]);
    }
    const result = await resolveCase(fixture.id);
    assert.equal(result.status, 'RESUELTO'); assert.equal(result.currentPublication?.status, 'OCULTO');
    assert.equal(result.resolution?.measure, 'OCULTAR'); assert.equal(result.currentPublication?.deletedAt, null);
    assert.deepEqual(result.snapshot, fixture.snapshot);
    assert.equal((await db.query('SELECT * FROM archivo_publicacion WHERE id=$1', [fixture.fileId])).rows.length, 1);
    await assert.rejects(resolveCase(fixture.id), { status: 409 });
  }
  assert.equal((await audits()).length, 2);
  const noTarget = await report('PUBLICACION_FISICA');
  assert.equal((await resolveCase(noTarget, dismiss)).status, 'DESESTIMADO');
});

test('retired or already hidden publications preserve logical deletion and terminal states while report closes', async () => {
  for (const deleted of [true, false]) {
    const fixture = await digitalCase();
    await db.query(`UPDATE publicacion_recurso SET estado_publicacion=$2,deleted_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1`, [fixture.publicationId, deleted ? 'CANCELADO' : 'OCULTO', deleted]);
    const result = await resolveCase(fixture.id); assert.equal(result.status, 'RESUELTO');
    assert.equal(result.currentPublication?.status, deleted ? 'CANCELADO' : 'OCULTO'); assert.equal(!!result.currentPublication?.deletedAt, deleted);
  }
});

test('competing resolutions produce only one final decision and audit', async () => {
  const fixture = await digitalCase();
  const results = await Promise.allSettled([resolveCase(fixture.id), resolveCase(fixture.id, dismiss)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal((await audits()).length, 1);
});

test('transaction report uses the actual publication relationship, preserves requests, agreement, confirmations and acquired download', async () => {
  const fixture = await digitalCase(), receiver = randomUUID(), requestId = randomUUID(), tradeId = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [receiver]);
  await db.query("INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) VALUES($1,$2,$3,'Receptor',now())", [receiver, institution, campus]);
  await db.exec("INSERT INTO mensaje_solicitud(codigo,descripcion) VALUES('QA_RESOLUTION','Me interesa') ON CONFLICT DO NOTHING");
  await db.query("INSERT INTO solicitud_recurso(id,publicacion_id,solicitante_id,codigo_mensaje) VALUES($1,$2,$3,'QA_RESOLUTION')", [requestId, fixture.publicationId, receiver]);
  await db.query(`INSERT INTO transaccion_recurso(id,publicacion_id,solicitud_id,propietario_id,receptor_id,modalidad_acordada,estado_transaccion)
    VALUES($1,$2,$3,$4,$5,'DONACION','COMPLETADA')`, [tradeId, fixture.publicationId, requestId, auth.userId, receiver]);
  await db.query("INSERT INTO confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) VALUES($1,$2,'PROPIETARIO'),($1,$3,'RECEPTOR')", [tradeId, auth.userId, receiver]);
  await db.query('INSERT INTO acceso_recurso_digital(transaccion_id,publicacion_id,receptor_id) VALUES($1,$2,$3)', [tradeId, fixture.publicationId, receiver]);
  await db.query("UPDATE reporte_contenido SET entidad_tipo='TRANSACCION',entidad_id=$2 WHERE id=$1", [fixture.id, tradeId]);
  const tables = ['solicitud_recurso', 'transaccion_recurso', 'confirmacion_transaccion', 'acceso_recurso_digital', 'archivo_publicacion'];
  const original = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table} ORDER BY id`)));
  const result = await resolveCase(fixture.id); assert.equal(result.currentPublication?.status, 'OCULTO');
  for (let i = 0; i < tables.length; i++) assert.deepEqual((await db.query(`SELECT * FROM ${tables[i]} ORDER BY id`)).rows, original[i].rows, tables[i]);
  const receiverAuth = { ...auth, userId: receiver, profile: { ...auth.profile, id: receiver } };
  const { getDigitalOriginal } = await import('../src/modules/marketplace/elibrary/services/elibrary.files.service.js');
  const file = await getDigitalOriginal(receiverAuth, fixture.publicationId, fixture.fileId);
  assert.deepEqual(file.bytes, bytes);
});

test('strict API validation rejects privileged fields, unknown decisions, empty/oversize/NUL justification without mutation', async () => {
  const id = await report();
  for (const input of [null, [], {}, { ...decision, decision: 'SUSPENDER' }, { ...decision, measure: 'DELETE' },
    { ...decision, resolvedById: randomUUID() }, { ...decision, campusId: other }, { ...decision, justification: ' ' },
    { ...decision, justification: 42 }, { ...decision, justification: 'a'.repeat(2001) }, { ...decision, justification: 'No\u0000válido' }]) {
    await assert.rejects(resolveCase(id, input), { status: 400 });
  }
  assert.equal((await reviews.getReportReview(auth, campus, id, transaction)).status, 'PENDIENTE');
  assert.equal((await audits()).length, 0); assert.equal(mongoWrites, 0);
});

test('resolution rechecks current account/roles and scopes identifiers to active campus, including explicitly delegated campus', async () => {
  const id = await report('ACTIVIDAD', other);
  await assert.rejects(resolveCase(id, dismiss), { status: 404 });
  await assert.rejects(resolveCase(id, dismiss, other), { status: 403 });
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) SELECT $1,id,$2 FROM rol WHERE nombre='ADMINISTRADOR'", [auth.userId, other]);
  assert.equal((await resolveCase(id, dismiss, other)).campusId, other);
  const localId = await report();
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE perfil_usuario_id=$1', [auth.userId]);
  await assert.rejects(resolveCase(localId, dismiss), { status: 403 });
  await db.query('UPDATE usuario_rol SET revocado_en=NULL WHERE perfil_usuario_id=$1', [auth.userId]);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1", [auth.userId]);
  await assert.rejects(resolveCase(localId, dismiss), { status: 403 });
});

test('publication resolution and visibility roll back together if audit fails; commit acknowledgement loss cannot resolve twice', async () => {
  const fixture = await digitalCase(); failAudit = true;
  await assert.rejects(resolveCase(fixture.id), error => (error as any).status === 503 && !/private/.test(String(error)));
  failAudit = false;
  const pending = await reviews.getReportReview(auth, campus, fixture.id, transaction);
  assert.equal(pending.status, 'PENDIENTE'); assert.equal(pending.resolution, null); assert.equal(pending.currentPublication?.status, 'DISPONIBLE');
  const uncertain: typeof transaction = async operation => { await transaction(operation); throw new Error('COMMIT acknowledgement lost'); };
  await assert.rejects(resolutions.resolveReport(auth, campus, fixture.id, decision, uncertain), { status: 503 });
  assert.equal((await reviews.getReportReview(auth, campus, fixture.id, transaction)).status, 'RESUELTO');
  await assert.rejects(resolveCase(fixture.id), { status: 409 }); assert.equal((await audits()).length, 1);
});

function reportedActivity() {
  activity = { _id: new ObjectId('123456789012345678901234'), campusId: campus, visibility: 'PUBLIC', status: 'ACTIVE',
    title: 'Actual editada', participantCount: 7, editRevision: 4, changeHistory: [{ title: 'Cambio previo' }], deletedAt: null };
}

test('activity resolution hides exactly its occurrence, preserving lifecycle, participation counters and history; repeat is rejected', async () => {
  const id = await report(); reportedActivity();
  const result = await resolveCase(id);
  assert.equal(result.status, 'RESUELTO'); assert.equal(result.resolution?.measure, 'OCULTAR'); assert.equal(mongoWrites, 1);
  assert.equal(activity?.visibility, 'HIDDEN'); assert.equal(activity?.status, 'ACTIVE'); assert.equal(activity?.participantCount, 7);
  assert.equal(activity?.editRevision, 5); assert.deepEqual(activity?.changeHistory, [{ title: 'Cambio previo' }]);
  assert.equal(result.snapshot?.title, 'Actividad original'); assert.equal((await audits()).length, 1);
  await assert.rejects(resolveCase(id), { status: 409 }); assert.equal(mongoWrites, 1);
});

test('Mongo failure leaves durable decision, forbids changing it and allows a competent retry to finish with one audit', async () => {
  const id = await report(); reportedActivity(); failMongo = true;
  await assert.rejects(resolveCase(id), error => (error as any).status === 503 && !/credentials|Mongo/.test(String(error)));
  const pending = await reviews.getReportReview(auth, campus, id, transaction);
  assert.equal(pending.status, 'EN_REVISION'); assert.equal(pending.resolution?.justification, decision.justification);
  assert.equal(activity?.visibility, 'PUBLIC'); assert.equal((await audits()).length, 0);
  for (const input of [dismiss, { ...decision, justification: 'Otra decisión' }]) await assert.rejects(resolveCase(id, input), { status: 409 });
  failMongo = false;
  const finished = await resolveCase(id); assert.equal(finished.status, 'RESUELTO'); assert.deepEqual(finished.resolution, pending.resolution);
  assert.equal(mongoWrites, 1); assert.equal((await audits()).length, 1);
});

test('SQL audit failure after Mongo hide is recoverable without undoing moderation, incrementing revision again or replacing responsible admin', async () => {
  const id = await report(); reportedActivity(); failAudit = true;
  await assert.rejects(resolveCase(id), { status: 503 }); failAudit = false;
  const pending = await reviews.getReportReview(auth, campus, id, transaction);
  assert.equal(pending.status, 'EN_REVISION'); assert.equal(activity?.visibility, 'HIDDEN'); assert.equal(mongoWrites, 1);
  assert.equal((await audits()).length, 0);
  const finished = await resolveCase(id); assert.equal(finished.status, 'RESUELTO'); assert.deepEqual(finished.resolution, pending.resolution);
  assert.equal(mongoWrites, 1); assert.equal(activity?.editRevision, 5); assert.equal((await audits()).length, 1);
});

test('logical deletion counts as already hidden; wrong-campus activity cannot be modified and permissions are rechecked before Mongo', async () => {
  const id = await report(); reportedActivity(); activity!.deletedAt = new Date();
  assert.equal((await resolveCase(id)).status, 'RESUELTO'); assert.equal(mongoWrites, 0);
  const wrong = await report(); reportedActivity(); activity!.campusId = other;
  await assert.rejects(resolveCase(wrong), { status: 409 }); assert.equal(mongoWrites, 0);
  const revoked = await report(); let calls = 0;
  const revokeBetween: typeof transaction = async operation => {
    const result = await transaction(operation);
    if (++calls === 1) await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE perfil_usuario_id=$1', [auth.userId]);
    return result;
  };
  await assert.rejects(resolutions.resolveReport(auth, campus, revoked, decision, revokeBetween), { status: 403 }); assert.equal(mongoWrites, 0);
});

test('HTTP resolution requires authentication, rejects query/body tampering, returns no-store final decision and duplicate409', async () => {
  const fixture = await digitalCase();
  const post = (suffix = '', input: unknown = decision, token = true) => originalFetch(base + campus + '/' + fixture.id + '/resolution' + suffix,
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer review.token' } : {}) }, body: JSON.stringify(input) });
  assert.equal((await post('', decision, false)).status, 401);
  assert.equal((await post('?campusId=' + other)).status, 400);
  assert.equal((await post('', { ...decision, actorId: randomUUID() })).status, 400);
  const response = await post(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.json(); assert.equal(body.data.status, 'RESUELTO'); assert.equal(body.data.resolution.resolvedById, auth.userId);
  assert.equal((await post()).status, 409); assert.equal((await audits()).length, 1);
});

test('listing filters campus before stable pagination, exposes minimal content/reason/date/status without reporter or snapshot', async () => {
  const ids = [await report(), await report(), await report()]; await report('ACTIVIDAD', other);
  const first = await reviews.listReportReviews(auth, campus, { page: '1', limit: '2' }, transaction);
  const second = await reviews.listReportReviews(auth, campus, { page: '2', limit: '2' }, transaction);
  assert.equal(first.meta.hasMore, true); assert.equal(second.meta.hasMore, false);
  assert.deepEqual(new Set([...first.data, ...second.data].map(row => row.id)), new Set(ids));
  for (const entry of first.data) {
    assert.equal(entry.campusId, campus); assert.equal(entry.title, 'Actividad original'); assert.equal(entry.status, 'PENDIENTE');
    assert.equal(entry.reason, 'Motivo privado'); assert.ok(Number.isFinite(Date.parse(entry.reportedAt)));
    assert.deepEqual(Object.keys(entry).sort(), ['campusId', 'entityId', 'entityType', 'id', 'reason', 'reportedAt', 'resolution', 'status', 'title']);
  }
});

test('status filters all campus records before pagination, preserves ties and includes only recorded final metadata', async () => {
  const final: string[] = [];
  for (let index = 0; index < 25; index++) {
    const id = await report();
    await db.query("UPDATE reporte_contenido SET reportado_en='2026-10-28T12:00:00Z' WHERE id=$1", [id]);
    if (index % 2 === 0) {
      final.push(id);
      await db.query(`UPDATE reporte_contenido SET estado_reporte='RESUELTO',medida_aplicada='OCULTAR',
        resuelto_por_id=$2,resuelto_en='2026-10-28T13:00:00Z',fundamento_resolucion='Fundamento privado' WHERE id=$1`, [id, auth.userId]);
    }
  }
  const outside = await report('ACTIVIDAD', other);
  await db.query("UPDATE reporte_contenido SET estado_reporte='RESUELTO' WHERE id=$1", [outside]);
  const rows = [];
  for (let page = 1; page <= 3; page++) {
    const result = await reviews.listReportReviews(auth, campus, { status: 'RESUELTO', page: String(page), limit: '5' }, transaction);
    assert.equal(result.meta.hasMore, page < 3); rows.push(...result.data);
  }
  assert.deepEqual(rows.map(row => row.id), final.sort().reverse());
  for (const row of rows) {
    assert.equal(row.status, 'RESUELTO'); assert.equal(row.campusId, campus);
    assert.deepEqual(row.resolution, { measure: 'OCULTAR', resolvedById: auth.userId, resolvedAt: '2026-10-28T13:00:00.000000Z' });
    assert.ok(!/Fundamento privado|reporter|snapshot|Administrador/.test(JSON.stringify(row)));
  }
  assert.equal((await reviews.listReportReviews(auth, campus, { status: 'PENDIENTE' }, transaction)).data.length, 12);
  for (const status of ['EN_REVISION', 'DESESTIMADO']) assert.equal((await reviews.listReportReviews(auth, campus, { status }, transaction)).data.length, 0);
  for (const status of ['', 'resuelto', 'TODAS', ['RESUELTO'], { value: 'RESUELTO' }, "RESUELTO' OR 1=1--"]) {
    await assert.rejects(reviews.listReportReviews(auth, campus, { status }, transaction), { status: 400 });
  }
  await assert.rejects(reviews.listReportReviews(auth, other, { status: 'RESUELTO' }, transaction), { status: 403 });
  for (const query of ['status=RESUELTO&status=PENDIENTE', 'status=', 'status=INVALID', 'status[eq]=RESUELTO']) {
    assert.equal((await http(campus + '?' + query)).status, 400);
  }
  const response = await http(campus + '?status=RESUELTO&limit=5&page=2'); assert.equal(response.status, 200);
  const body = await response.json(); assert.deepEqual(body.data.map((row: { id: string }) => row.id), final.slice(5, 10));
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal((await audits()).length, 0); assert.equal(mongoWrites, 0);
});

test('content types combine with status and campus before pagination without exposing private case data', async () => {
  const types = ['ACTIVIDAD', 'PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'TRANSACCION'];
  const expected = new Map<string, { id: string; status: string }[]>();
  for (const type of types) {
    const rows = [];
    for (let index = 0; index < 7; index++) {
      const id = await report(type), status = index % 2 ? 'DESESTIMADO' : 'PENDIENTE';
      await db.query("UPDATE reporte_contenido SET reportado_en='2026-10-29T12:00:00Z',estado_reporte=$2 WHERE id=$1", [id, status]);
      rows.push({ id, status });
    }
    expected.set(type, rows.sort((a, b) => b.id.localeCompare(a.id)));
    await report(type, other);
  }
  for (const entityType of types) {
    const rows = [];
    for (let page = 1; page <= 4; page++) {
      const result = await reviews.listReportReviews(auth, campus, { entityType, limit: '2', page: String(page) }, transaction);
      assert.equal(result.meta.hasMore, page < 4); rows.push(...result.data);
    }
    assert.deepEqual(rows.map(row => row.id), expected.get(entityType)!.map(row => row.id));
    for (const row of rows) {
      assert.equal(row.entityType, entityType); assert.equal(row.campusId, campus);
      assert.ok(!/reporter|snapshot|people|email|description/.test(JSON.stringify(row)));
    }
    const result = await http(campus + `?entityType=${entityType}&status=PENDIENTE&limit=2&page=2`);
    assert.equal(result.status, 200); assert.match(result.headers.get('cache-control') ?? '', /no-store/);
    const body = await result.json(); assert.equal(body.meta.hasMore, false);
    assert.deepEqual(body.data.map((row: { id: string }) => row.id), expected.get(entityType)!.filter(row => row.status === 'PENDIENTE').slice(2).map(row => row.id));
    await assert.rejects(reviews.listReportReviews(auth, other, { entityType }, transaction), { status: 403 });
  }
  assert.equal((await reviews.listReportReviews(auth, campus, { limit: '100' }, transaction)).data.length, 28);
  assert.equal((await audits()).length, 0); assert.equal(mongoWrites, 0);
});

test('content type query rejects empty, repeated, structured and unknown values; historical endpoint stays compatible', async () => {
  for (const entityType of ['', 'actividad', 'TODOS', 'DIGITAL', ['ACTIVIDAD'], { eq: 'ACTIVIDAD' }, "ACTIVIDAD' OR 1=1--"]) {
    await assert.rejects(reviews.listReportReviews(auth, campus, { entityType }, transaction), { status: 400 });
  }
  for (const query of ['entityType=', 'entityType=INVALID', 'entityType=ACTIVIDAD&entityType=TRANSACCION', 'entityType[eq]=ACTIVIDAD', 'entityType[]=ACTIVIDAD']) {
    assert.equal((await http(campus + '?' + query)).status, 400);
  }
  await assert.rejects(reviews.listReportResolutions(auth, campus, { entityType: 'ACTIVIDAD' }, transaction), { status: 400 });
});

test('unified closed detail equals historical detail after live edits and legacy nulls remain absent', async () => {
  const fixture = await digitalCase(); await resolveCase(fixture.id, dismiss);
  await db.query("UPDATE publicacion_recurso SET titulo='Título cambiado',deleted_at=now() WHERE id=$1", [fixture.publicationId]);
  const original = await reviews.getReportResolution(auth, campus, fixture.id, transaction);
  assert.deepEqual(await reviews.getReportReview(auth, campus, fixture.id, transaction), original);
  const response = await http(campus + '/' + fixture.id); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, original);
  assert.equal(original.reporter.name, null); assert.equal(original.currentPublication, null); assert.deepEqual(original.snapshot, fixture.snapshot);
  const legacy = await report(); await db.query("UPDATE reporte_contenido SET estado_reporte='RESUELTO' WHERE id=$1", [legacy]);
  const detail = await reviews.getReportReview(auth, campus, legacy, transaction);
  assert.deepEqual(detail.resolution, { measure: null, justification: null, resolvedById: null, resolvedAt: null });
  assert.equal(detail.reporter.name, null);
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
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [receiverId]);
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
  for (const query of [{ campusId: other }, { page: ['1'] }, { limit: '101' }, { page: '0' }, { page: '1;select 1' }, { status: 'INVALID' }, { status: ['PENDIENTE'] }, { status: '' }]) {
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
    if (['RESUELTO', 'DESESTIMADO'].includes(status)) {
      assert.equal(detail.currentPublication, null); assert.equal(detail.reporter.name, null);
    } else {
      assert.equal(detail.currentPublication?.title, 'Libro editado'); assert.equal(detail.currentPublication?.status, 'DISPONIBLE');
    }
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
