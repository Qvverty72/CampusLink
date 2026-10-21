import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), foreignInstitution = randomUUID(), campus = randomUUID(), sibling = randomUUID(), foreignCampus = randomUUID();
const token = 'digital.test.token';
let current: VerifiedAuthConnection, auth: VerifiedAuthConnection, server: Server, base: string, pdf: Buffer;
let closePostgres: () => Promise<void>;
let service: typeof import('../src/modules/marketplace/elibrary/elibrary.service.js');
let validation: typeof import('../src/modules/marketplace/elibrary/elibrary.validation.js');
let failUpload: boolean, failInsert: boolean, failRemove: boolean, failReference: boolean, lostCommit: boolean, failCommit: boolean;
let publicBucket: boolean, missingBucket: boolean, smallBucket: boolean;
let onUpload: (() => Promise<void>) | null;
let onDownload: (() => Promise<void>) | null, failDownload = false, corruptDownload = false;
let filesService: typeof import('../src/modules/marketplace/elibrary/elibrary.files.service.js');
let uploads: string[], removals: string[], storageCalls: string[], logs: unknown[][];
let objects = new Map<string, Buffer>(), connectionLease = Promise.resolve();
let barriers = 0;
let failAcademicInsert = false, failAudit = false;
let failDigitalAccess = false;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://digital-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_DB_URL: 'postgresql://postgres:simulated@digital-test.invalid/postgres' });
  mock.method(console, 'error', (...args: unknown[]) => logs.push(args));
  mock.method(Pool.prototype, 'connect', async () => {
    const previous = connectionLease; let releaseLease!: () => void;
    connectionLease = new Promise<void>(resolve => { releaseLease = resolve; }); await previous;
    return { query: async (sql: string, values: unknown[] = []) => {
      if (failInsert && sql.startsWith('INSERT INTO public.archivo_publicacion')) throw new Error('private SQL password');
      if (failAcademicInsert && sql.startsWith('INSERT INTO public.publicacion_asignatura')) throw new Error('private academic SQL');
      if (failAudit && sql.startsWith('INSERT INTO public.auditoria')) throw new Error('private audit SQL');
      if (failDigitalAccess && sql.includes('INSERT INTO public.acceso_recurso_digital')) throw new Error('private access SQL');
      if (failReference && sql.includes('SELECT EXISTS(SELECT 1 FROM public.archivo_publicacion')) throw new Error('private connection');
      if (failCommit && sql === 'COMMIT') { failCommit = false; throw new Error('failed commit'); }
      if (sql.includes('pg_advisory_xact_lock')) barriers++;
      const result = await db.query(sql, values);
      if (lostCommit && sql === 'COMMIT') { lostCommit = false; throw new Error('lost commit acknowledgement'); }
      return result;
    }, release: () => releaseLease() };
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://digital-test.invalid');
    const headers = new Headers(init?.headers);
    if (!url.pathname.startsWith('/storage/v1/')) {
      if (headers.get('authorization') !== 'Bearer ' + token) return Response.json({ message: 'invalid token' }, { status: 401 });
      if (url.pathname === '/auth/v1/user') return Response.json({ id: current.userId, email: 'qa@duocuc.cl', email_confirmed_at: '2026-10-20T00:00:00Z' });
      if (url.pathname.endsWith('/perfil_usuario')) return Response.json([current.profile]);
      const kind = url.pathname.endsWith('/usuario_rol') ? 'rol' : 'permiso';
      return Response.json((kind === 'rol' ? current.roles : current.permissions).map(row => ({ campus_id: row.campusId, [kind]: { id: row.id, nombre: row.name } })));
    }
    assert.equal(headers.get('apikey'), 'sb_secret_test');
    storageCalls.push(url.pathname);
    if (url.pathname === '/storage/v1/bucket/digital-resources') return missingBucket
      ? Response.json({ error: 'Not Found', message: 'private bucket' }, { status: 404 })
      : Response.json({ id: 'digital-resources', name: 'digital-resources', public: publicBucket,
        file_size_limit: smallBucket ? 1 : 26214400, allowed_mime_types: ['application/pdf'] });
    if (init?.method === 'DELETE') {
      const paths: string[] = JSON.parse(String(init.body)).prefixes; removals.push(...paths);
      if (failRemove) return Response.json({ error: 'private failure' }, { status: 500 });
      paths.forEach(path => objects.delete(path)); return Response.json([]);
    }
    if ((init?.method ?? 'GET') === 'GET' && url.pathname.startsWith('/storage/v1/object/digital-resources/')) {
      const path = decodeURIComponent(url.pathname.replace('/storage/v1/object/digital-resources/', ''));
      await onDownload?.();
      if (failDownload || !objects.has(path)) return Response.json({ error: 'private download failure' }, { status: 500 });
      return new Response(new Uint8Array(corruptDownload ? Buffer.from('bad') : objects.get(path)!), { headers: { 'Content-Type': 'application/pdf' } });
    }
    assert.equal(init?.method, 'POST'); assert.ok(!url.pathname.includes('/sign/'));
    assert.equal(headers.get('content-type'), 'application/pdf'); assert.equal(headers.get('x-upsert'), 'false');
    const path = url.pathname.replace('/storage/v1/object/digital-resources/', '');
    uploads.push(path); objects.set(path, Buffer.from(init?.body as Uint8Array));
    await onUpload?.();
    return failUpload ? Response.json({ error: 'private failure' }, { status: 500 }) : Response.json({ Key: path, Id: randomUUID() });
  };
  service = await import('../src/modules/marketplace/elibrary/elibrary.service.js');
  filesService = await import('../src/modules/marketplace/elibrary/elibrary.files.service.js');
  validation = await import('../src/modules/marketplace/elibrary/elibrary.validation.js');
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'carrera', 'asignatura', 'carrera_asignatura', 'perfil_usuario', 'rol', 'usuario_rol', 'publicacion_recurso', 'recurso_digital', 'archivo_publicacion',
    'publicacion_carrera', 'publicacion_asignatura', 'mensaje_solicitud', 'solicitud_recurso', 'transaccion_recurso', 'confirmacion_transaccion', 'acceso_recurso_digital', 'reporte_contenido', 'auditoria']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  // Restricciones adicionales observadas en remoto, aún ausentes en el snapshot histórico.
  await db.exec(`ALTER TABLE campus ADD UNIQUE(id,institucion_id);
    ALTER TABLE perfil_usuario ADD FOREIGN KEY(campus_id,institucion_id) REFERENCES campus(id,institucion_id);
    ALTER TABLE archivo_publicacion ADD UNIQUE(bucket_id,storage_path);
    ALTER TABLE acceso_recurso_digital ADD UNIQUE(publicacion_id,receptor_id);
    ALTER TABLE confirmacion_transaccion ADD UNIQUE(transaccion_id,rol_confirmante);
    ALTER TABLE confirmacion_transaccion ADD UNIQUE(transaccion_id,usuario_id);
    CREATE UNIQUE INDEX solicitud_activa_test ON solicitud_recurso(publicacion_id,solicitante_id) WHERE estado_solicitud IN ('PENDIENTE','ACEPTADA');
    ALTER TABLE transaccion_recurso ADD CHECK(propietario_id<>receptor_id);
    ALTER TABLE transaccion_recurso ADD CHECK((estado_transaccion='COMPLETADA')=(completada_en IS NOT NULL));
    ALTER TABLE publicacion_recurso ADD CHECK ((modalidad='VENTA' AND precio>0 AND precio IS NOT NULL) OR (modalidad='DONACION' AND precio IS NULL));
    ALTER TABLE publicacion_recurso ENABLE ROW LEVEL SECURITY; ALTER TABLE archivo_publicacion ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT ON publicacion_recurso,archivo_publicacion TO service_role;
    CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;`);
  await db.exec(await readFile('src/database/supabase/migrations/f2_5_01_publicacion_digital.sql', 'utf8'));
  await db.exec(`ALTER TABLE auditoria DROP CONSTRAINT auditoria_accion_check;
    ALTER TABLE auditoria ADD CHECK(accion IN ('PUBLICAR_PUBLICACION','EDITAR_PUBLICACION','RETIRAR_PUBLICACION'))`);
  await db.query('insert into institucion(id,nombre) values($1,$2),($3,$4)', [institution, 'Institución A', foreignInstitution, 'Institución B']);
  await db.query('insert into campus(id,institucion_id,nombre) values($1,$2,$3),($4,$2,$5),($6,$7,$8)',
    [campus, institution, 'Origen', sibling, 'Otra sede', foreignCampus, foreignInstitution, 'Ajeno']);
  await db.exec("insert into rol(nombre) values('USUARIO_AUTORIZADO'),('ADMINISTRADOR')");
  await db.exec("insert into mensaje_solicitud(codigo,descripcion) values('LIB_QA_INTERES','Me interesa este recurso académico')");
  const document = await PDFDocument.create(); document.addPage().drawText('Apuntes academicos'); pdf = Buffer.from(await document.save());
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/marketplace/elibrary';
});
beforeEach(async () => {
  failAcademicInsert = failAudit = false;
  failDigitalAccess = false;
  onDownload = null; failDownload = corruptDownload = false;
  uploads = []; removals = []; storageCalls = []; logs = []; objects = new Map(); barriers = 0;
  failUpload = failInsert = failRemove = failReference = lostCommit = failCommit = publicBucket = missingBucket = smallBucket = false; onUpload = null;
  const userId = randomUUID();
  await db.query('insert into auth.users values($1)', [userId]);
  await db.query("insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values($1,$2,$3,'Estudiante',now())", [userId, institution, campus]);
  auth = { userId, campusId: campus, roles: [], permissions: [], profile: { id: userId, campus_id: campus, institucion_id: institution,
    nombre_completo: 'Estudiante', foto_path: null, verificado_en: '2026-10-20T00:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null } };
  current = structuredClone(auth);
});
after(async () => { globalThis.fetch = originalFetch; await new Promise<void>(resolve => server.close(() => resolve())); await closePostgres(); mock.restoreAll(); await db.close(); });
const input = (overrides: Record<string, unknown> = {}) => ({ title: ' Apuntes ', description: ' Material académico ', modality: 'VENTA', price: 2500, ...overrides });
const file = (bytes = pdf) => ({ name: 'apuntes.pdf', mimeType: 'application/pdf', bytes });
async function noPublication() {
  assert.equal((await db.query('select id from publicacion_recurso where propietario_id=$1', [auth.userId])).rows.length, 0);
}
async function post(metadata: unknown = input(), bytes: Buffer | null = pdf, authorization: string | null = 'Bearer ' + token, name = 'apuntes.pdf') {
  const body = new FormData(); body.append('metadata', JSON.stringify(metadata));
  if (bytes) body.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), name);
  return originalFetch(base, { method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body });
}
const get = (suffix = '') => originalFetch(base + suffix, { headers: { Authorization: 'Bearer ' + token } });
async function switchCampus(campusId: string, institutionId = institution) {
  current.campusId = campusId; current.profile.campus_id = campusId; current.profile.institucion_id = institutionId;
  await db.query('update perfil_usuario set campus_id=$2,institucion_id=$3 where id=$1', [auth.userId, campusId, institutionId]);
}

test('multipart sale persists server identity, digital subtype and private file atomically without returning paths', async () => {
  const response = await post(); assert.equal(response.status, 201);
  const { data } = await response.json(); assert.equal(data.title, 'Apuntes'); assert.equal(data.status, 'DISPONIBLE');
  assert.equal(data.ownerId, auth.userId); assert.equal(data.campusId, campus); assert.equal(data.institutionId, institution);
  assert.match(data.files[0].id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(data.files, [{ id: data.files[0].id, name: 'apuntes.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length }]);
  const rows = (await db.query(`select p.*,d.publicacion_id,a.bucket_id,a.storage_path,a.tipo_archivo,a.tamano_bytes
    from publicacion_recurso p join recurso_digital d on d.publicacion_id=p.id join archivo_publicacion a on a.publicacion_id=p.id where p.id=$1`, [data.id])).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].tipo_recurso, 'DIGITAL'); assert.equal(rows[0].bucket_id, 'digital-resources');
  assert.equal(rows[0].tipo_archivo, 'RECURSO'); assert.equal(Number(rows[0].tamano_bytes), pdf.length);
  assert.ok(uploads[0].startsWith(`${campus}/${auth.userId}/${data.id}/`)); assert.deepEqual(objects.get(uploads[0]), pdf);
  assert.doesNotMatch(JSON.stringify(data), /storage_path|bucket_id|https:|base64|digital-resources/); assert.equal(removals.length, 0);
});
test('donation has no sale price', async () => {
  const response = await post(input({ modality: 'DONACION', price: null })); assert.equal(response.status, 201);
  assert.equal((await response.json()).data.price, null);
});
test('file mandatory, with empty/multiple/unknown multipart parts rejected', async () => {
  assert.equal((await post(input(), null)).status, 400);
  assert.equal((await post(input(), Buffer.alloc(0))).status, 400);
  for (const extra of ['file', 'ownerId', 'metadata']) {
    const body = new FormData(); body.append('metadata', JSON.stringify(input())); body.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'a.pdf');
    body.append(extra, extra === 'file' ? new Blob([new Uint8Array(pdf)]) : 'malicious');
    assert.equal((await originalFetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body })).status, 400);
  }
  await noPublication(); assert.equal(uploads.length, 0);
});
test('exact 25 MiB accepted; oversized files rejected in transport and service', async () => {
  const exact = Buffer.alloc(validation.DIGITAL_MAX_BYTES, 32); pdf.copy(exact); Buffer.from('\n%%EOF\n').copy(exact, exact.length - 7);
  assert.equal((await post(input(), exact)).status, 201);
  const tooBig = Buffer.alloc(validation.DIGITAL_MAX_BYTES + 1);
  assert.equal((await post(input(), tooBig)).status, 413);
  await assert.rejects(validation.validateDigitalFile(file(tooBig)), { status: 413 });
  assert.equal(uploads.length, 1);
});
test('rejects spoofed, truncated, empty-page, encrypted-marker and active PDFs including object-stream JavaScript', async () => {
  const active = await PDFDocument.create(); active.addPage(); active.addJavaScript('attack', 'app.alert(1)');
  const nested = await PDFDocument.create(); nested.addPage(); nested.catalog.set(PDFName.of('OpenAction'), nested.context.obj({ S: 'JavaScript', JS: PDFString.of('attack') }));
  const attachment = await PDFDocument.create(); attachment.addPage(); await attachment.attach(new Uint8Array([1, 2]), 'a.exe');
  const encrypted = await PDFDocument.load(pdf); encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: 'Standard' }));
  for (const bytes of [Buffer.from('<script>bad()</script>'), Buffer.from('%PDF-1.7\nfake\n%%EOF'), pdf.subarray(0, 100),
    Buffer.from(await (await PDFDocument.create()).save({ addDefaultPage: false })), Buffer.from(await active.save()),
    Buffer.from(await nested.save()), Buffer.from(await attachment.save()), Buffer.from(await encrypted.save())]) {
    assert.equal((await post(input(), bytes)).status, 400);
  }
  await assert.rejects(validation.validateDigitalFile({ ...file(), mimeType: 'text/plain' }), { status: 400 });
  for (const name of ['../apuntes.pdf', 'apuntes.exe', 'a\u0000.pdf']) await assert.rejects(validation.validateDigitalFile({ ...file(), name }), { status: 400 });
  await noPublication(); assert.equal(uploads.length, 0);
});
test('inconsistent prices and modalities rejected', async () => {
  for (const patch of [{ modality: 'AMBAS' }, { modality: 'DONACION', price: 1 }, { modality: 'DONACION', price: 0 },
    { price: 0 }, { price: -1 }, { price: '2500' }, { price: null }, { price: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.equal((await post(input(patch))).status, 400);
  }
  assert.equal(uploads.length, 0); await noPublication();
});
test('unauthenticated/invalid tokens and inactive or unverified accounts are rejected', async () => {
  assert.equal((await post(input(), pdf, null)).status, 401);
  assert.equal((await post(input(), pdf, 'Bearer wrong.token')).status, 401);
  for (const state of ['SUSPENDIDA', 'DESACTIVADA'] as const) {
    current.profile.estado_cuenta = state; assert.equal((await post()).status, 403); assert.equal((await get()).status, 403);
  }
  current.profile.estado_cuenta = 'ACTIVA'; current.profile.verificado_en = null;
  assert.equal((await post()).status, 403); assert.equal((await get()).status, 403);
  assert.equal(uploads.length, 0); await noPublication();
});
test('rejects privileged fields, malformed metadata, non-multipart and malicious IDs without SQL exposure', async () => {
  for (const key of ['ownerId', 'campusId', 'institutionId', 'status', 'files', 'path', 'bucket', '__proto__']) {
    const metadata = JSON.parse(JSON.stringify(input()).slice(0, -1) + `,"${key}":"malicious"}`);
    assert.equal((await post(metadata)).status, 400);
  }
  assert.equal((await post(input({ title: '\u0000bad' }))).status, 400);
  assert.equal((await get("/x%27%3Bdrop%20table%20perfil_usuario")).status, 400);
  assert.equal((await originalFetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  assert.equal(uploads.length, 0); await noPublication();
});
test('text that resembles SQL is stored as data with parameterized queries', async () => {
  const title = "Apuntes'); DROP TABLE perfil_usuario; --";
  const saved = await service.createDigitalPublication(auth, input({ title }), file());
  assert.equal((await service.getDigitalPublications(auth, saved.id))[0].title, title);
  assert.ok((await db.query('select id from perfil_usuario where id=$1', [auth.userId])).rows.length);
});
test('same institution other campus can list/read; foreign institution cannot and origin stays unchanged', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  await switchCampus(sibling);
  const response = await get('/' + saved.id); assert.equal(response.status, 200);
  const result = (await response.json()).data; assert.equal(result.campusId, campus); assert.equal(result.ownerId, auth.userId);
  assert.ok((await (await get()).json()).data.some((item: { id: string }) => item.id === saved.id));
  await db.query('update campus set activo=false where id=$1', [campus]);
  try { assert.equal((await get('/' + saved.id)).status, 200); }
  finally { await db.query('update campus set activo=true where id=$1', [campus]); }
  await switchCampus(foreignCampus, foreignInstitution);
  assert.equal((await get('/' + saved.id)).status, 404);
  assert.ok(!(await (await get()).json()).data.some((item: { id: string }) => item.id === saved.id));
  assert.equal(storageCalls.filter(path => path.includes('/sign/')).length, 0);
});
test('metadata consultation hides original URLs and unsupported original routes remain unavailable', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  for (const route of ['/download', '/files', '/file', '/photo', '/preview']) assert.equal((await get('/' + saved.id + route)).status, 404);
  const response = await get('/' + saved.id); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(JSON.stringify(await response.json()), /storage_path|bucket_id|signedUrl|https:|digital-resources/);
});
test('hidden, deleted, non-digital or fileless publications never appear', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  for (const update of ["estado_publicacion='OCULTO'", "estado_publicacion='CANCELADO'", "deleted_at=now()", "tipo_recurso='FISICO'"]) {
    await db.query(`update publicacion_recurso set ${update} where id=$1`, [saved.id]);
    assert.equal((await get('/' + saved.id)).status, 404);
    await db.query("update publicacion_recurso set estado_publicacion='DISPONIBLE',deleted_at=null,tipo_recurso='DIGITAL' where id=$1", [saved.id]);
  }
  await db.query('update archivo_publicacion set deleted_at=now() where publicacion_id=$1', [saved.id]);
  assert.equal((await get('/' + saved.id)).status, 404);
});
test('account/role/campus changes during upload are revalidated and compensated', async () => {
  for (const sql of ["update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",
    'update perfil_usuario set verificado_en=null where id=$1', 'update perfil_usuario set campus_id=$2 where id=$1']) {
    onUpload = () => db.query(sql, sql.includes('$2') ? [auth.userId, sibling] : [auth.userId]).then(() => {});
    await assert.rejects(service.createDigitalPublication(auth, input(), file()), (error: unknown) => [403, 409].includes((error as { status: number }).status));
    assert.equal(objects.size, 0); await noPublication();
    await db.query("update perfil_usuario set estado_cuenta='ACTIVA',verificado_en=now(),campus_id=$2 where id=$1", [auth.userId, campus]);
  }
});
test('incoherent institution/campus and inactive campuses cannot authorize publication or reading', async () => {
  await db.query('update campus set activo=false where id=$1', [campus]);
  try { await assert.rejects(service.createDigitalPublication(auth, input(), file()), { status: 403 }); await assert.rejects(service.getDigitalPublications(auth), { status: 403 }); }
  finally { await db.query('update campus set activo=true where id=$1', [campus]); }
  const forged = structuredClone(auth); forged.profile.institucion_id = foreignInstitution;
  await assert.rejects(service.getDigitalPublications(forged), { status: 409 });
  await noPublication(); assert.equal(objects.size, 0);
});
test('Storage error after receiving bytes is compensated without available SQL publication', async () => {
  failUpload = true; assert.equal((await post()).status, 503);
  assert.equal(uploads.length, 1); assert.equal(removals.length, 1); assert.equal(objects.size, 0); await noPublication();
});
test('public, missing or incompatible bucket is refused before upload', async () => {
  for (const flag of ['public', 'missing', 'small']) {
    publicBucket = flag === 'public'; missingBucket = flag === 'missing'; smallBucket = flag === 'small';
    assert.equal((await post()).status, 503);
  }
  assert.equal(uploads.length, 0); await noPublication();
});
test('file metadata INSERT failure rolls back publication and subtype, then compensates Storage', async () => {
  failInsert = true; assert.equal((await post()).status, 503); await noPublication();
  assert.equal(objects.size, 0); assert.equal(removals.length, 1); assert.equal(barriers, 2);
  assert.equal((await db.query('select d.publicacion_id from recurso_digital d left join publicacion_recurso p on p.id=d.publicacion_id where p.id is null')).rows.length, 0);
});
test('failed COMMIT rolls back and removes bytes; lost acknowledgement preserves referenced bytes and returns success', async () => {
  failCommit = true; assert.equal((await post()).status, 503); await noPublication(); assert.equal(objects.size, 0);
  lostCommit = true; const response = await post(); assert.equal(response.status, 201);
  const saved = (await response.json()).data; assert.equal((await get('/' + saved.id)).status, 200);
  assert.equal(objects.size, 1); assert.equal(removals.length, 1); assert.equal(barriers, 4);
});
test('unavailable reconciliation or failed removal keeps original safe and logs only publication UUID', async () => {
  failInsert = failReference = true; assert.equal((await post()).status, 503); await noPublication();
  assert.equal(objects.size, 1); assert.equal(removals.length, 0);
  failReference = false; failRemove = true; assert.equal((await post()).status, 503); await noPublication();
  assert.equal(logs.length, 2); assert.doesNotMatch(JSON.stringify(logs), /password|storage_path|sb_secret|digital-resources/);
});
test('migration is repeatable and restrictive Storage policy defeats future broad client policies', async () => {
  const migration = await readFile('src/database/supabase/migrations/f2_5_01_publicacion_digital.sql', 'utf8');
  await db.exec(migration); await db.exec(migration);
  await db.exec("CREATE POLICY broad_test ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true)");
  await db.exec("insert into storage.objects(bucket_id,name) values('digital-resources','private.pdf'),('publication-images','physical.png')");
  for (const role of ['anon', 'authenticated']) {
    await db.exec('SET ROLE ' + role);
    try {
      assert.equal((await db.query("select * from storage.objects where bucket_id='digital-resources'")).rows.length, 0);
      assert.equal((await db.query("select * from storage.objects where bucket_id='publication-images'")).rows.length, 1);
      assert.equal((await db.query("delete from storage.objects where bucket_id='digital-resources' returning *")).rows.length, 0);
      await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('digital-resources','attack.pdf')"));
      for (const table of ['recurso_digital', 'publicacion_recurso', 'archivo_publicacion']) await assert.rejects(db.query('select * from ' + table));
    } finally { await db.exec('RESET ROLE'); }
  }
  await db.exec('SET ROLE service_role');
  try { assert.equal((await db.query("select * from storage.objects where bucket_id='digital-resources'")).rows.length, 1); }
  finally { await db.exec('RESET ROLE'); }
  await db.exec('DROP POLICY broad_test ON storage.objects');
});

test('authorized unverified account follows existing general capability, but role revocation during upload denies publication', async () => {
  await db.query('update perfil_usuario set verificado_en=null where id=$1', [auth.userId]);
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) select $1,id,$2 from rol where nombre='USUARIO_AUTORIZADO'", [auth.userId, campus]);
  auth.profile.verificado_en = null; auth.roles = [{ id: randomUUID(), name: 'USUARIO_AUTORIZADO', campusId: campus }];
  current = structuredClone(auth);
  onUpload = () => db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1', [auth.userId]).then(() => {});
  await assert.rejects(service.createDigitalPublication(auth, input(), file()), { status: 403 });
  await noPublication(); assert.equal(objects.size, 0);
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1', [auth.userId]);
  onUpload = null; assert.equal((await post()).status, 201);
});
test('Unicode filenames survive multipart; file-before-metadata also works without trusting MIME claims', async () => {
  const response = await post(input(), pdf, 'Bearer ' + token, 'apuntes académicos.pdf'); assert.equal(response.status, 201);
  assert.equal((await response.json()).data.files[0].name, 'apuntes académicos.pdf');
  const body = new FormData(); body.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'a.pdf');
  body.append('metadata', JSON.stringify(input()));
  assert.equal((await originalFetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body })).status, 201);
  const spoofed = new FormData(); spoofed.append('metadata', JSON.stringify(input()));
  spoofed.append('file', new Blob([new Uint8Array(pdf)], { type: 'text/plain' }), 'a.pdf');
  assert.equal((await originalFetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: spoofed })).status, 400);
});
test('malformed boundary/metadata and excessive raw chunked body reject safely without persistence', async () => {
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=test' };
  for (const body of ['broken', '--test\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{bad\r\n--test--\r\n',
    '--test\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n' + 'x'.repeat(21 * 1024) + '\r\n--test--\r\n']) {
    assert.equal((await originalFetch(base, { method: 'POST', headers, body })).status, 400);
  }
  const status = await new Promise<number>(resolve => {
    const request = httpRequest(base, { method: 'POST', headers }, response => { response.resume(); resolve(response.statusCode!); });
    request.on('error', error => { throw error; });
    request.write('--test\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n');
    request.end(Buffer.alloc(validation.DIGITAL_MAX_BYTES + 64 * 1024));
  });
  assert.equal(status, 413); await noPublication(); assert.equal(uploads.length, 0);
});

async function peer(campusId = sibling, institutionId = institution): Promise<VerifiedAuthConnection> {
  const id = randomUUID(); await db.query('insert into auth.users values($1)', [id]);
  await db.query("insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values($1,$2,$3,'Receiver',now())", [id, institutionId, campusId]);
  return { userId: id, campusId, roles: [], permissions: [], profile: { ...auth.profile, id, campus_id: campusId, institucion_id: institutionId } };
}
async function acquisition(publicationId: string, receiverId: string, confirmations = 2) {
  const transactionId = randomUUID(), requestId = randomUUID(), code = randomUUID();
  await db.query("insert into mensaje_solicitud(codigo,descripcion) values($1,'QA')", [code]);
  await db.query("insert into solicitud_recurso(id,publicacion_id,solicitante_id,codigo_mensaje,estado_solicitud) values($1,$2,$3,$4,'ACEPTADA')", [requestId, publicationId, receiverId, code]);
  await db.query(`insert into transaccion_recurso(id,solicitud_id,publicacion_id,propietario_id,receptor_id,estado_transaccion,modalidad_acordada,monto_acordado,completada_en)
    values($1,$2,$3,$4,$5,'COMPLETADA','VENTA',2500,now())`, [transactionId, requestId, publicationId, auth.userId, receiverId]);
  await db.query('insert into acceso_recurso_digital(transaccion_id,publicacion_id,receptor_id) values($1,$2,$3)', [transactionId, publicationId, receiverId]);
  if (confirmations > 0) await db.query("insert into confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) values($1,$2,'PROPIETARIO')", [transactionId, auth.userId]);
  if (confirmations > 1) await db.query("insert into confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) values($1,$2,'RECEPTOR')", [transactionId, receiverId]);
  return transactionId;
}
async function attach(id: string, bytes: Buffer | null = pdf, extra = false) {
  const body = new FormData(); if (bytes) body.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), 'segundo.pdf');
  if (extra) body.append('metadata', '{}');
  return originalFetch(`${base}/${id}/files`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body });
}
const original = (publicationId: string, fileId: string) => get(`/${publicationId}/files/${fileId}/download`);

async function academicCatalog() {
  const careerA = randomUUID(), careerB = randomUUID(), foreignCareer = randomUUID(), inactiveCareer = randomUUID();
  const shared = randomUUID(), other = randomUUID(), foreignSubject = randomUUID(), inactive = randomUUID(), orphan = randomUUID();
  await db.query(`INSERT INTO carrera(id,institucion_id,nombre,codigo,activo) VALUES
    ($1,$5,'Ingeniería','ING',true),($2,$5,'Ciencias','CIE',true),($3,$6,'Ajena','EXT',true),($4,$5,'Inactiva','OFF',false)`,
    [careerA, careerB, foreignCareer, inactiveCareer, institution, foreignInstitution]);
  for (const [id, name, active] of [[shared, 'Cálculo compartido', true], [other, 'Física', true], [foreignSubject, 'Ajena', true],
    [inactive, 'Inactiva', false], [orphan, 'Sin carrera', true]] as const) {
    await db.query('INSERT INTO asignatura(id,nombre,codigo,activo) VALUES($1::uuid,$2,$1::uuid::text,$3)', [id, name, active]);
  }
  await db.query(`INSERT INTO carrera_asignatura(carrera_id,asignatura_id,semestre_nivel) VALUES
    ($1,$4,1),($2,$4,2),($2,$5,1),($3,$6,1),($1,$7,1)`, [careerA, careerB, foreignCareer, shared, other, foreignSubject, inactive]);
  return { careerA, careerB, foreignCareer, inactiveCareer, shared, other, foreignSubject, inactive, orphan };
}
const patchAcademics = (id: string, body: unknown, suffix = '', authorization: string | null = 'Bearer ' + token) =>
  originalFetch(`${base}/${id}/academics${suffix}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body) });
const selection = (publication: { updatedAt: string }, careerIds: string[] = [], subjectIds: string[] = []) => ({ careerIds, subjectIds, updatedAt: publication.updatedAt });

test('academic options use current institution across campuses and keep a shared subject as one identity', async () => {
  const data = await academicCatalog();
  await switchCampus(sibling);
  const response = await get('/academic-options'); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { data: catalog } = await response.json();
  assert.ok(catalog.careers.some((row: { id: string }) => row.id === data.careerA));
  assert.ok(!catalog.careers.some((row: { id: string }) => [data.foreignCareer, data.inactiveCareer].includes(row.id)));
  const shared = catalog.subjects.filter((row: { id: string }) => row.id === data.shared);
  assert.equal(shared.length, 1); assert.deepEqual([...shared[0].careerIds].sort(), [data.careerA, data.careerB].sort());
  assert.ok(!catalog.subjects.some((row: { id: string }) => [data.foreignSubject, data.inactive, data.orphan].includes(row.id)));
  assert.equal((await get('/academic-options?institutionId=' + foreignInstitution)).status, 400);
  assert.equal((await originalFetch(base + '/academic-options')).status, 401);
});
test('publication creates multiple direct associations atomically and returns names/codes in same-institution reads', async () => {
  const c = await academicCatalog();
  const response = await post(input({ careerIds: [c.careerB, c.careerA], subjectIds: [c.shared, c.other] })); assert.equal(response.status, 201);
  const { data: saved } = await response.json();
  assert.deepEqual([...saved.careerIds].sort(), [c.careerA, c.careerB].sort()); assert.equal(saved.careers.length, 2);
  assert.deepEqual([...saved.subjectIds].sort(), [c.shared, c.other].sort()); assert.equal(saved.subjects.length, 2);
  assert.match(saved.updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  assert.equal((await db.query('SELECT * FROM publicacion_asignatura WHERE publicacion_id=$1 AND asignatura_id=$2', [saved.id, c.shared])).rows.length, 1);
  await switchCampus(sibling); const detail = (await (await get('/' + saved.id)).json()).data;
  assert.deepEqual(detail.subjects, saved.subjects); assert.deepEqual(detail.careers, saved.careers);
  assert.deepEqual((await db.query('SELECT datos_despues FROM auditoria WHERE entidad_id=$1', [saved.id])).rows[0].datos_despues.subjects, saved.subjects);
  await switchCampus(foreignCampus, foreignInstitution); assert.equal((await get('/' + saved.id)).status, 404);
});
test('direct associations need not be personal careers or dependent on selected career; omission remains compatible', async () => {
  const c = await academicCatalog();
  // Física pertenece a carreraB; el recurso puede servir también a carreraA mediante enlaces directos.
  const saved = await service.createDigitalPublication(auth, input({ careerIds: [c.careerA], subjectIds: [c.other] }), file());
  assert.deepEqual(saved.subjectIds, [c.other]);
  const unclassified = await service.createDigitalPublication(auth, input(), file());
  assert.deepEqual(unclassified.careers, []); assert.deepEqual(unclassified.subjects, []);
});
test('academic payload rejects duplicate/malformed IDs and privileged inputs before Storage', async () => {
  const c = await academicCatalog();
  for (const patch of [{ careerIds: [c.careerA, c.careerA.toUpperCase()] }, { subjectIds: [c.shared, c.shared] },
    { careerIds: 'bad' }, { careerIds: null }, { subjectIds: null }, { subjectIds: [null] }, { careerIds: ["x'; DROP TABLE carrera; --"] }, { subjectIds: {} }]) {
    assert.equal((await post(input(patch))).status, 400);
  }
  for (const patch of [{ careerIds: [randomUUID()] }, { careerIds: [c.foreignCareer] }, { careerIds: [c.inactiveCareer] },
    { subjectIds: [c.foreignSubject] }, { subjectIds: [c.inactive] }, { subjectIds: [c.orphan] }]) assert.equal((await post(input(patch))).status, 400);
  await noPublication(); assert.equal(uploads.length, 0);
});
test('academic availability is checked again after Storage and invalidated selection compensates bytes', async () => {
  const c = await academicCatalog();
  onUpload = () => db.query('UPDATE asignatura SET activo=false WHERE id=$1', [c.shared]).then(() => {});
  assert.equal((await post(input({ careerIds: [c.careerA], subjectIds: [c.shared] }))).status, 400);
  await noPublication(); assert.equal(objects.size, 0); assert.equal(removals.length, 1);
});
test('academic insertion or history failure rolls back publication/relations and compensates Storage', async () => {
  const c = await academicCatalog();
  for (const failure of ['academic', 'audit']) {
    failAcademicInsert = failure === 'academic'; failAudit = failure === 'audit';
    const response = await post(input({ careerIds: [c.careerA], subjectIds: [c.shared] })); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|SQL|password/); await noPublication(); assert.equal(objects.size, 0);
  }
  assert.equal((await db.query('SELECT * FROM auditoria WHERE actor_usuario_id=$1', [auth.userId])).rows.length, 0);
});
test('lost creation COMMIT receipt recovers the complete academic publication and its single history event', async () => {
  const c = await academicCatalog(); onUpload = async () => { lostCommit = true; };
  const response = await post(input({ careerIds: [c.careerA, c.careerB], subjectIds: [c.shared] })); assert.equal(response.status, 201);
  const { data: saved } = await response.json(); assert.equal(saved.careers.length, 2); assert.deepEqual(saved.subjectIds, [c.shared]);
  assert.equal((await db.query('SELECT * FROM auditoria WHERE entidad_id=$1', [saved.id])).rows.length, 1);
  assert.equal(objects.size, 1); assert.equal(removals.length, 0);
});
test('deactivated catalog remains readable and historical names are retained when associations are removed', async () => {
  const c = await academicCatalog(), saved = await service.createDigitalPublication(auth, input({ careerIds: [c.careerA], subjectIds: [c.shared] }), file());
  await db.query("UPDATE asignatura SET nombre='Nombre nuevo',activo=false WHERE id=$1", [c.shared]);
  const actual = (await service.getDigitalPublications(auth, saved.id))[0]; assert.equal(actual.subjects[0].name, 'Nombre nuevo');
  assert.equal((await patchAcademics(saved.id, selection(actual, actual.careerIds, actual.subjectIds))).status, 400);
  assert.equal((await patchAcademics(saved.id, selection(actual, actual.careerIds, []))).status, 200);
  const snapshots = (await db.query('SELECT datos_antes,datos_despues FROM auditoria WHERE entidad_id=$1 ORDER BY created_at,id', [saved.id])).rows;
  assert.equal(snapshots[0].datos_despues.subjects[0].name, 'Cálculo compartido'); assert.equal(snapshots[1].datos_antes.subjects[0].name, 'Nombre nuevo');
  assert.deepEqual(snapshots[1].datos_despues.subjects, []);
});
test('owner can replace and remove associations from another campus with no changes to terms/files/acquisitions', async () => {
  const c = await academicCatalog(), saved = await service.createDigitalPublication(auth, input({ careerIds: [c.careerA], subjectIds: [c.shared] }), file());
  const receiver = await peer(); const transactionId = await acquisition(saved.id, receiver.userId);
  const transaction = (await db.query('SELECT * FROM transaccion_recurso WHERE id=$1', [transactionId])).rows[0];
  await switchCampus(sibling);
  const response = await patchAcademics(saved.id, selection(saved, [c.careerB], [c.other, c.shared])); assert.equal(response.status, 200);
  const after = (await response.json()).data; assert.deepEqual(after.careerIds, [c.careerB]); assert.equal(after.subjects.length, 2); assert.notEqual(after.updatedAt, saved.updatedAt);
  assert.equal(after.campusId, campus); assert.deepEqual(after.files, saved.files); assert.equal(after.price, saved.price);
  assert.deepEqual((await db.query('SELECT * FROM transaccion_recurso WHERE id=$1', [transactionId])).rows[0], transaction);
  assert.deepEqual((await filesService.getDigitalOriginal(receiver, saved.id, saved.files[0].id)).bytes, pdf);
  const history = (await db.query("SELECT datos_antes,datos_despues,campus_id FROM auditoria WHERE entidad_id=$1 AND accion='EDITAR_PUBLICACION'", [saved.id])).rows[0];
  assert.deepEqual(history.datos_antes.careers, saved.careers); assert.deepEqual(history.datos_despues.careers, after.careers); assert.equal(history.campus_id, campus);
  const cleared = await patchAcademics(saved.id, selection(after)); assert.equal(cleared.status, 200);
  assert.deepEqual((await cleared.json()).data.subjects, []);
  assert.equal((await db.query('SELECT * FROM publicacion_carrera WHERE publicacion_id=$1', [saved.id])).rows.length, 0);
});
test('academic editor rejects peers/admins/outsiders/disabled accounts and never accepts privileged fields', async () => {
  const c = await academicCatalog(), saved = await service.createDigitalPublication(auth, input(), file());
  const body = selection(saved, [c.careerA], [c.shared]);
  assert.equal((await patchAcademics(saved.id, body, '', null)).status, 401);
  for (const extra of [{ ownerId: auth.userId }, { title: 'changed' }, { institutionId: institution }, { files: [] }, { updatedAt: 'bad' },
    { careerIds: [c.careerA, c.careerA] }, { subjectIds: [c.foreignSubject] }, { careerIds: null }]) assert.equal((await patchAcademics(saved.id, { ...body, ...extra })).status, 400);
  assert.equal((await patchAcademics(saved.id, { updatedAt: saved.updatedAt })).status, 400);
  assert.equal((await patchAcademics(saved.id, body, '?campusId=' + campus)).status, 400);
  const receiver = await peer(); current = receiver; assert.equal((await patchAcademics(saved.id, body)).status, 403);
  await db.query("INSERT INTO usuario_rol(perfil_usuario_id,campus_id,rol_id) SELECT $1,$2,id FROM rol WHERE nombre='ADMINISTRADOR'", [receiver.userId, receiver.campusId]);
  current.roles = [{ id: randomUUID(), name: 'ADMINISTRADOR', campusId: receiver.campusId }]; assert.equal((await patchAcademics(saved.id, body)).status, 403);
  current = await peer(foreignCampus, foreignInstitution); assert.equal((await patchAcademics(saved.id, body)).status, 404);
  current = structuredClone(auth); current.profile.estado_cuenta = 'SUSPENDIDA'; assert.equal((await patchAcademics(saved.id, body)).status, 403);
  current = structuredClone(auth); current.profile.verificado_en = null; assert.equal((await patchAcademics(saved.id, body)).status, 403);
  // Revalida PostgreSQL aunque el contexto autenticado todavía describa una cuenta habilitada.
  current = structuredClone(auth); await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1", [auth.userId]);
  assert.equal((await patchAcademics(saved.id, body)).status, 403);
});
test('optimistic version prevents concurrent overwrite and unchanged sets create no history/version', async () => {
  const c = await academicCatalog(), saved = await service.createDigitalPublication(auth, input({ careerIds: [c.careerA, c.careerB], subjectIds: [c.shared] }), file());
  const unchanged = await patchAcademics(saved.id, selection(saved, [...saved.careerIds].reverse(), saved.subjectIds)); assert.equal(unchanged.status, 200);
  assert.equal((await unchanged.json()).data.updatedAt, saved.updatedAt);
  assert.equal((await db.query('SELECT * FROM auditoria WHERE entidad_id=$1', [saved.id])).rows.length, 1);
  const responses = await Promise.all([patchAcademics(saved.id, selection(saved, [c.careerA], [c.other])), patchAcademics(saved.id, selection(saved, [c.careerB], []))]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
  assert.equal((await db.query('SELECT * FROM auditoria WHERE entidad_id=$1', [saved.id])).rows.length, 2);
});
test('attachment changes invalidate academic version and removed resources reject academic edit', async () => {
  const c = await academicCatalog(), saved = await service.createDigitalPublication(auth, input(), file());
  await filesService.addDigitalAttachment(auth, saved.id, file());
  assert.equal((await patchAcademics(saved.id, selection(saved, [c.careerA]))).status, 409);
  for (const sql of ["deleted_at=now()", "estado_publicacion='OCULTO'"]) {
    await db.query(`UPDATE publicacion_recurso SET ${sql} WHERE id=$1`, [saved.id]);
    assert.equal((await patchAcademics(saved.id, selection(saved))).status, 409);
    await db.query("UPDATE publicacion_recurso SET deleted_at=null,estado_publicacion='DISPONIBLE' WHERE id=$1", [saved.id]);
  }
});
test('failed academic edit leaves previous sets and history intact; uncertain COMMIT requires read before retry', async () => {
  const c = await academicCatalog(), saved = await service.createDigitalPublication(auth, input({ careerIds: [c.careerA], subjectIds: [c.shared] }), file());
  const body = selection(saved, [c.careerB], [c.other]);
  for (const failure of ['insert', 'audit', 'commit']) {
    failAcademicInsert = failure === 'insert'; failAudit = failure === 'audit'; failCommit = failure === 'commit';
    assert.equal((await patchAcademics(saved.id, body)).status, 503);
    const actual = (await service.getDigitalPublications(auth, saved.id))[0]; assert.deepEqual(actual.subjectIds, saved.subjectIds); assert.equal(actual.updatedAt, saved.updatedAt);
  }
  failAcademicInsert = failAudit = false; lostCommit = true;
  assert.equal((await patchAcademics(saved.id, body)).status, 503);
  const actual = (await service.getDigitalPublications(auth, saved.id))[0]; assert.deepEqual(actual.subjectIds, [c.other]);
  assert.equal((await patchAcademics(saved.id, body)).status, 409); assert.equal(objects.size, 1);
  assert.equal((await db.query('SELECT * FROM auditoria WHERE entidad_id=$1', [saved.id])).rows.length, 2);
});
test('audit projection retains historical academic names/codes without arbitrary data or private paths', async () => {
  const { auditSnapshot } = await import('../src/modules/users/audit.snapshot.js');
  assert.deepEqual(auditSnapshot({ careers: [{ id: 'c', name: 'Old career', code: 'C', secret: 'bad' }],
    subjects: [{ id: 's', name: 'Old subject', code: 'S', storage_path: 'private' }], bucket: 'private' }),
  { careers: [{ id: 'c', name: 'Old career', code: 'C' }], subjects: [{ id: 's', name: 'Old subject', code: 'S' }] });
});

test('digital search combines text, modality and direct multiple associations without duplicate rows', async () => {
  const c = await academicCatalog(), marker = randomUUID();
  const sale = await service.createDigitalPublication(auth, input({ title: marker + ' Apuntes', careerIds: [c.careerA,c.careerB], subjectIds: [c.shared,c.other] }), file());
  await service.createDigitalPublication(auth, input({ description: marker, modality: 'DONACION', price: null }), file());
  await switchCampus(sibling);
  const response = await get(`?q=${marker}&careerId=${c.careerB}&subjectId=${c.shared}&modality=VENTA`); assert.equal(response.status, 200);
  const result = await response.json(); assert.deepEqual(result.data.map((row: {id:string}) => row.id), [sale.id]);
  assert.deepEqual(result.meta, {page:1,limit:20,hasMore:false});
  assert.equal((await (await get(`?q=${marker}&modality=DONACION`)).json()).data.length, 1);
  assert.equal((await (await get(`?q=${marker}`)).json()).data.length, 2);
  await switchCampus(foreignCampus, foreignInstitution); assert.deepEqual((await (await get(`?q=${marker}`)).json()).data, []);
});
test('digital search paginates deterministically and hides withdrawn/hidden resources', async () => {
  const marker = randomUUID(), ids = [];
  for (let i=0;i<8;i++) ids.push((await service.createDigitalPublication(auth, input({title:marker+' '+i}), file())).id);
  const pages = [];
  for (let page=1;page<=3;page++) { const response = await get(`?q=${marker}&page=${page}&limit=3`); assert.equal(response.status,200); pages.push(await response.json()); }
  assert.deepEqual(pages.map(row=>row.data.length),[3,3,2]); assert.deepEqual(pages.map(row=>row.meta.hasMore),[true,true,false]);
  assert.equal(new Set(pages.flatMap(row=>row.data.map((item:{id:string})=>item.id))).size,8);
  await db.query("UPDATE publicacion_recurso SET estado_publicacion='OCULTO' WHERE id=$1",[ids[0]]);
  await db.query('UPDATE publicacion_recurso SET deleted_at=now() WHERE id=$1',[ids[1]]);
  assert.equal((await (await get(`?q=${marker}`)).json()).data.length,6);
  assert.deepEqual((await (await get(`?q=${marker}&page=9`)).json()).data,[]);
});
test('digital search treats wildcard/SQL-like text literally and rejects malformed/privileged filters', async () => {
  const marker = randomUUID();
  await service.createDigitalPublication(auth, input({title:marker+' 100%_\\'}), file());
  assert.equal((await (await get('?q='+encodeURIComponent(marker+' 100%_\\'))).json()).data.length,1);
  assert.deepEqual((await (await get('?q='+encodeURIComponent("'; DROP TABLE carrera; --"))).json()).data,[]);
  for (const query of ['campusId='+campus,'institutionId='+institution,'ownerId='+auth.userId,'page=0','limit=101','page=2&page=3','q[]=x','q='+('x'.repeat(201)),"careerId=bad",'subjectId=bad','modality=AMBAS']) assert.equal((await get('?'+query)).status,400,query);
  assert.equal((await db.query('SELECT id FROM carrera LIMIT 1')).rows.length,1);
});

test('protected preview returns a fixed partial text fragment to institutional peers without original access', async () => {
  const doc = await PDFDocument.create(); doc.addPage().drawText('Primera pagina\n'+ 'contenido academico limitado para estudiantes\n'.repeat(25), { x:30,y:740,size:12,lineHeight:16 });
  doc.addPage().drawText('SEGUNDA_PAGINA_SECRETA'); const bytes = Buffer.from(await doc.save());
  const saved = await service.createDigitalPublication(auth,input(),file(bytes)); current = await peer();
  const response = await get(`/${saved.id}/files/${saved.files[0].id}/preview`); assert.equal(response.status,200);
  const {data} = await response.json(); assert.equal(data.available,true); assert.ok(data.text.length<=400);assert.ok(data.text.length>20);
  assert.doesNotMatch(JSON.stringify(data),/SEGUNDA_PAGINA_SECRETA|storage_path|bucket_id|https:|digital-resources|%PDF/);
  assert.equal((await original(saved.id,saved.files[0].id)).status,403);
  for(const suffix of ['?page=2','?offset=400','?url=https://evil.invalid'])assert.equal((await get(`/${saved.id}/files/${saved.files[0].id}/preview${suffix}`)).status,400);
  assert.equal(response.headers.get('cache-control'),'no-store');
  current=await peer(foreignCampus,foreignInstitution); assert.equal((await get(`/${saved.id}/files/${saved.files[0].id}/preview`)).status,404);
});
test('preview falls back safely for short/scanned text and revalidates identity after reading Storage', async () => {
  const saved = await service.createDigitalPublication(auth,input(),file());
  const route=`/${saved.id}/files/${saved.files[0].id}/preview`;
  const response=await get(route);assert.equal(response.status,200);assert.deepEqual((await response.json()).data.available,false);
  assert.equal((await originalFetch(base+route)).status,401);
  onDownload=()=>db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1",[auth.userId]).then(()=>{});
  assert.equal((await get(route)).status,403);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA' WHERE id=$1",[auth.userId]);onDownload=null;failDownload=true;
  const failure=await get(route);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private|storage_path|password/);
});
test('preview worker concurrency is bounded and slots are released after extraction', async () => {
  const {extractDigitalPreview}=await import('../src/modules/marketplace/elibrary/elibrary.preview.extractor.js');
  const first=extractDigitalPreview(pdf), second=extractDigitalPreview(pdf);
  await assert.rejects(extractDigitalPreview(pdf),{status:503});await Promise.all([first,second]);
  assert.equal(await extractDigitalPreview(pdf),null);
});

const digitalJson=(path:string,method:string,body:unknown)=>originalFetch(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function requestAndAccept(saved:{id:string},receiver:VerifiedAuthConnection) {
  const trades=await import('../src/modules/marketplace/elibrary/elibrary.trades.service.js');
  const requested=await trades.createDigitalRequest(receiver,saved.id,{messageCode:'LIB_QA_INTERES'});
  const accepted=await trades.resolveDigitalRequest(auth,saved.id,requested.id,{decision:'ACEPTAR'});assert.ok(accepted.transactionId);return {trades,requested,accepted,tradeId:accepted.transactionId!};
}
test('digital request, owner acceptance and both confirmations grant institutional cross-campus access for sale/donation',async()=>{
  const trades=await import('../src/modules/marketplace/elibrary/elibrary.trades.service.js');
  for(const modality of ['VENTA','DONACION']) {
    const saved=await service.createDigitalPublication(auth,input({modality,price:modality==='VENTA'?2500:null}),file()),receiver=await peer();current=receiver;
    const options=await get('/'+saved.id+'/request-options');assert.equal(options.status,200);assert.equal((await options.json()).data.canRequest,true);
    const response=await digitalJson('/'+saved.id+'/requests','POST',{messageCode:'LIB_QA_INTERES'});assert.equal(response.status,201);const requested=(await response.json()).data;
    current=structuredClone(auth);const accepted=await digitalJson(`/${saved.id}/requests/${requested.id}`,'PATCH',{decision:'ACEPTAR'});assert.equal(accepted.status,200);const tradeId=(await accepted.json()).data.transactionId;
    assert.equal((await originalFetch(`${base}/${saved.id}/transactions/${tradeId}`)).status,401);
    assert.equal((await digitalJson(`/${saved.id}/transactions/${tradeId}/confirm`,'POST',{})).status,200);
    assert.equal((await db.query('SELECT * FROM acceso_recurso_digital WHERE publicacion_id=$1',[saved.id])).rows.length,0);
    current=receiver;assert.equal((await original(saved.id,saved.files[0].id)).status,403);
    const completed=await digitalJson(`/${saved.id}/transactions/${tradeId}/confirm`,'POST',{});assert.equal(completed.status,200);assert.equal((await completed.json()).data.status,'COMPLETADA');
    assert.deepEqual(Buffer.from(await (await original(saved.id,saved.files[0].id)).arrayBuffer()),pdf);
    assert.equal((await trades.getDigitalTrade(receiver,saved.id,tradeId)).amount,modality==='VENTA'?2500:null);
    assert.equal((await db.query('SELECT estado_publicacion FROM publicacion_recurso WHERE id=$1',[saved.id])).rows[0].estado_publicacion,'DISPONIBLE');
  }
});
test('digital requests prevent simultaneous duplicates, self requests, spoofing and non-owner resolution',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer(),other=await peer(),trades=await import('../src/modules/marketplace/elibrary/elibrary.trades.service.js');
  const results=await Promise.allSettled([trades.createDigitalRequest(receiver,saved.id,{messageCode:'LIB_QA_INTERES'}),trades.createDigitalRequest(receiver,saved.id,{messageCode:'LIB_QA_INTERES'})]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.filter(row=>row.status==='rejected'&&row.reason.status===409).length,1);
  const requested=(await trades.getDigitalRequests(receiver,{},false)).data[0];
  await assert.rejects(trades.createDigitalRequest(auth,saved.id,{messageCode:'LIB_QA_INTERES'}),{status:403});
  await assert.rejects(trades.resolveDigitalRequest(other,saved.id,requested.id,{decision:'ACEPTAR'}),{status:403});
  await assert.rejects(trades.resolveDigitalRequest(await peer(foreignCampus,foreignInstitution),saved.id,requested.id,{decision:'ACEPTAR'}),{status:404});
  for(const raw of [{messageCode:'bad'},{messageCode:'LIB_QA_INTERES',ownerId:auth.userId},{messageCode:'LIB_QA_INTERES',requesterId:other.userId}])await assert.rejects(trades.createDigitalRequest(other,saved.id,raw),{status:400});
  current=receiver;assert.equal((await get('/requests/received')).status,200);assert.equal((await (await get('/requests/received')).json()).data.length,0);
  assert.equal((await get('/requests/sent?ownerId='+auth.userId)).status,400);
});
test('digital cancellation and rejection preserve history without granting access; terms never change retroactively',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer();const {trades,tradeId}=await requestAndAccept(saved,receiver);
  await db.query("UPDATE publicacion_recurso SET precio=9999,modalidad='VENTA' WHERE id=$1",[saved.id]);
  assert.equal((await trades.getDigitalTrade(receiver,saved.id,tradeId)).amount,2500);
  await trades.transitionDigitalTrade(receiver,saved.id,tradeId,{},'CONFIRMAR');
  const cancelled=await trades.transitionDigitalTrade(auth,saved.id,tradeId,{},'CANCELAR');assert.equal(cancelled.status,'CANCELADA');
  assert.equal((await trades.transitionDigitalTrade(receiver,saved.id,tradeId,{},'CANCELAR')).status,'CANCELADA');
  await assert.rejects(trades.transitionDigitalTrade(receiver,saved.id,tradeId,{},'CONFIRMAR'),{status:409});
  assert.equal((await db.query('SELECT * FROM acceso_recurso_digital WHERE publicacion_id=$1',[saved.id])).rows.length,0);
  const again=await trades.createDigitalRequest(receiver,saved.id,{messageCode:'LIB_QA_INTERES'});
  assert.equal((await trades.resolveDigitalRequest(auth,saved.id,again.id,{decision:'RECHAZAR'})).status,'RECHAZADA');
  assert.equal((await db.query('SELECT * FROM transaccion_recurso WHERE publicacion_id=$1',[saved.id])).rows.length,1);
});
test('digital grant and confirmations roll back together; lost COMMIT is reconciled by reads and idempotent confirmation',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer();const {trades,tradeId}=await requestAndAccept(saved,receiver);
  await trades.transitionDigitalTrade(auth,saved.id,tradeId,{},'CONFIRMAR');failDigitalAccess=true;
  await assert.rejects(trades.transitionDigitalTrade(receiver,saved.id,tradeId,{},'CONFIRMAR'),{status:503});
  assert.equal((await db.query('SELECT * FROM confirmacion_transaccion WHERE transaccion_id=$1',[tradeId])).rows.length,1);
  assert.equal((await trades.getDigitalTrade(receiver,saved.id,tradeId)).status,'PENDIENTE_CONFIRMACION');
  failDigitalAccess=false;lostCommit=true;await assert.rejects(trades.transitionDigitalTrade(receiver,saved.id,tradeId,{},'CONFIRMAR'),{status:503});
  assert.equal((await trades.getDigitalTrade(receiver,saved.id,tradeId)).status,'COMPLETADA');
  assert.equal((await trades.transitionDigitalTrade(receiver,saved.id,tradeId,{},'CONFIRMAR')).status,'COMPLETADA');
  assert.equal((await db.query('SELECT * FROM acceso_recurso_digital WHERE publicacion_id=$1',[saved.id])).rows.length,1);
});
test('digital operations revalidate both institutional participants and private transaction participation',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer(),other=await peer();const {trades,tradeId}=await requestAndAccept(saved,receiver);
  await assert.rejects(trades.getDigitalTrade(other,saved.id,tradeId),{status:404});
  await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1",[receiver.userId]);
  await assert.rejects(trades.transitionDigitalTrade(auth,saved.id,tradeId,{},'CONFIRMAR'),{status:409});
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',campus_id=$2,institucion_id=$3 WHERE id=$1",[receiver.userId,foreignCampus,foreignInstitution]);
  await assert.rejects(trades.transitionDigitalTrade(auth,saved.id,tradeId,{},'CONFIRMAR'),{status:409});
  assert.equal((await trades.transitionDigitalTrade(auth,saved.id,tradeId,{},'CANCELAR')).status,'CANCELADA');
  current=other;assert.equal((await digitalJson(`/${saved.id}/transactions/${tradeId}/confirm`,'POST',{role:'PROPIETARIO'})).status,400);
});
test('multiple digital receivers complete independently without consuming publication or cancelling other requests',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),first=await peer(),second=await peer(),third=await peer();
  const one=await requestAndAccept(saved,first),two=await requestAndAccept(saved,second),three=await requestAndAccept(saved,third);
  await Promise.all([one.trades.transitionDigitalTrade(auth,saved.id,one.tradeId,{},'CONFIRMAR'),two.trades.transitionDigitalTrade(second,saved.id,two.tradeId,{},'CONFIRMAR')]);
  await Promise.all([one.trades.transitionDigitalTrade(first,saved.id,one.tradeId,{},'CONFIRMAR'),two.trades.transitionDigitalTrade(auth,saved.id,two.tradeId,{},'CONFIRMAR'),three.trades.transitionDigitalTrade(third,saved.id,three.tradeId,{},'CANCELAR')]);
  assert.equal((await db.query('SELECT * FROM acceso_recurso_digital WHERE publicacion_id=$1',[saved.id])).rows.length,2);
  assert.equal((await db.query('SELECT estado_publicacion FROM publicacion_recurso WHERE id=$1',[saved.id])).rows[0].estado_publicacion,'DISPONIBLE');
  for(const receiver of [first,second]) {assert.deepEqual((await filesService.getDigitalOriginal(receiver,saved.id,saved.files[0].id)).bytes,pdf);assert.equal((await service.getDigitalPublications(receiver,saved.id))[0].acquired,true);await assert.rejects(one.trades.createDigitalRequest(receiver,saved.id,{messageCode:'LIB_QA_INTERES'}),{status:409});}
  assert.equal((await service.getDigitalPublications(third,saved.id))[0].acquired,false);
  const fourth=await peer();assert.ok((await one.trades.createDigitalRequest(fourth,saved.id,{messageCode:'LIB_QA_INTERES'})).id);
  current=first;const result=await get('?q='+encodeURIComponent(saved.title));assert.ok((await result.json()).data.some((row:{id:string;acquired:boolean})=>row.id===saved.id&&row.acquired));
});
test('acquired materials are paginated private rights-backed reads with original terms after owner/resource deactivation',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer(),other=await peer();await acquisition(saved.id,receiver.userId);
  await db.query("UPDATE publicacion_recurso SET precio=9999,deleted_at=now(),estado_publicacion='OCULTO' WHERE id=$1",[saved.id]);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='DESACTIVADA' WHERE id=$1",[auth.userId]);current=receiver;
  const list=await get('/acquired?limit=1');assert.equal(list.status,200);const result=await list.json();assert.equal(result.data.length,1);assert.equal(result.meta.hasMore,false);
  assert.equal(result.data[0].isWithdrawn,true);assert.equal(result.data[0].acquisition.amount,2500);assert.equal(result.data[0].acquired,true);
  const detail=await get('/acquired/'+saved.id);assert.equal(detail.status,200);assert.doesNotMatch(JSON.stringify(await detail.json()),/storage_path|bucket_id|signedUrl|digital-resources/);
  assert.equal((await get('/'+saved.id)).status,404);assert.deepEqual(Buffer.from(await(await original(saved.id,saved.files[0].id)).arrayBuffer()),pdf);
  assert.equal((await get('/acquired?receiverId='+other.userId)).status,400);current=other;
  assert.equal((await get('/acquired/'+saved.id)).status,404);assert.deepEqual((await(await get('/acquired')).json()).data,[]);
});
test('acquired material reads exclude incomplete/revoked/mismatched rights and institutional changes',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer();const transactionId=await acquisition(saved.id,receiver.userId,1);current=receiver;
  assert.deepEqual((await(await get('/acquired')).json()).data,[]);
  await db.query("INSERT INTO confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) VALUES($1,$2,'RECEPTOR')",[transactionId,receiver.userId]);assert.equal((await get('/acquired/'+saved.id)).status,200);
  await db.query('DELETE FROM acceso_recurso_digital WHERE transaccion_id=$1',[transactionId]);assert.equal((await get('/acquired/'+saved.id)).status,404);
  await db.query('INSERT INTO acceso_recurso_digital(transaccion_id,publicacion_id,receptor_id) VALUES($1,$2,$3)',[transactionId,saved.id,receiver.userId]);
  await db.query('UPDATE perfil_usuario SET campus_id=$2,institucion_id=$3 WHERE id=$1',[receiver.userId,foreignCampus,foreignInstitution]);current={...receiver,campusId:foreignCampus,profile:{...receiver.profile,campus_id:foreignCampus,institucion_id:foreignInstitution}};
  assert.deepEqual((await(await get('/acquired')).json()).data,[]);assert.equal((await get('/acquired/'+saved.id)).status,404);
});
test('digital owner edits and withdraws with audit/version while previous acquisition terms/files remain intact',async()=>{
  const c=await academicCatalog(),saved=await service.createDigitalPublication(auth,input({careerIds:[c.careerA],subjectIds:[c.shared]}),file()),receiver=await peer();await acquisition(saved.id,receiver.userId);
  const raw={title:'Título vigente',description:'Descripción vigente',modality:'DONACION',price:null,updatedAt:saved.updatedAt};
  const response=await digitalJson('/'+saved.id,'PATCH',raw);assert.equal(response.status,200);const after=(await response.json()).data;
  assert.equal(after.price,null);assert.deepEqual(after.files,saved.files);assert.deepEqual(after.careerIds,saved.careerIds);assert.equal(after.ownerId,auth.userId);assert.equal(after.campusId,campus);
  assert.equal((await digitalJson('/'+saved.id,'PATCH',raw)).status,409);
  current=receiver;const acquired=(await(await get('/acquired/'+saved.id)).json()).data;assert.equal(acquired.acquisition.amount,2500);
  current=structuredClone(auth);const retired=await digitalJson('/'+saved.id,'DELETE',{updatedAt:after.updatedAt});assert.equal(retired.status,200);const result=(await retired.json()).data;assert.equal(result.isWithdrawn,true);
  assert.equal((await get('/'+saved.id)).status,404);assert.equal((await get('/mine/'+saved.id)).status,200);
  assert.equal((await digitalJson('/'+saved.id,'DELETE',{updatedAt:after.updatedAt})).status,200);
  assert.equal((await db.query('SELECT * FROM auditoria WHERE entidad_id=$1',[saved.id])).rows.length,3);
  const event=(await db.query("SELECT datos_antes,datos_despues FROM auditoria WHERE entidad_id=$1 AND accion='RETIRAR_PUBLICACION'",[saved.id])).rows[0];assert.equal(event.datos_antes.deleted_at,null);assert.ok(event.datos_despues.deleted_at);
  const trades=await import('../src/modules/marketplace/elibrary/elibrary.trades.service.js');await assert.rejects(trades.createDigitalRequest(await peer(),saved.id,{messageCode:'LIB_QA_INTERES'}),{status:409});
  assert.deepEqual((await filesService.getDigitalOriginal(receiver,saved.id,saved.files[0].id)).bytes,pdf);assert.equal(objects.size,1);
});
test('digital editor rejects privileged/non-owner inputs and rollback/uncertain COMMIT preserves recoverable history',async()=>{
  const saved=await service.createDigitalPublication(auth,input(),file()),receiver=await peer(),raw={title:saved.title,description:saved.description,modality:'VENTA',price:3000,updatedAt:saved.updatedAt};
  for(const extra of [{ownerId:receiver.userId},{files:[]},{careerIds:[]},{campusId:sibling},{price:0},{modality:'DONACION',price:1},{updatedAt:'bad'}])assert.equal((await digitalJson('/'+saved.id,'PATCH',{...raw,...extra})).status,400);
  current=receiver;assert.equal((await digitalJson('/'+saved.id,'PATCH',raw)).status,403);assert.equal((await get('/mine/'+saved.id)).status,404);
  current=await peer(foreignCampus,foreignInstitution);assert.equal((await digitalJson('/'+saved.id,'PATCH',raw)).status,404);
  current=structuredClone(auth);failAudit=true;assert.equal((await digitalJson('/'+saved.id,'PATCH',raw)).status,503);assert.equal((await service.getDigitalPublications(auth,saved.id))[0].price,2500);
  failAudit=false;failCommit=true;assert.equal((await digitalJson('/'+saved.id,'DELETE',{updatedAt:saved.updatedAt})).status,503);assert.equal((await get('/'+saved.id)).status,200);
  lostCommit=true;assert.equal((await digitalJson('/'+saved.id,'DELETE',{updatedAt:saved.updatedAt})).status,503);
  const owned=(await(await get('/mine/'+saved.id)).json()).data;assert.equal(owned.isWithdrawn,true);
  assert.equal((await db.query('SELECT * FROM auditoria WHERE entidad_id=$1',[saved.id])).rows.length,2);assert.equal(objects.size,1);
});

test('owner attaches many PDFs with ordered unique references; concurrent appends preserve every original', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => filesService.addDigitalAttachment(auth, saved.id, { ...file(), name: `archivo${index}.pdf` })));
  const publication = (await service.getDigitalPublications(auth, saved.id))[0]; assert.equal(publication.files.length, 9);
  assert.equal(new Set(publication.files.map(row => row.id)).size, 9); assert.equal(objects.size, 9);
  const rows = (await db.query('select orden,storage_path from archivo_publicacion where publicacion_id=$1 order by orden', [saved.id])).rows;
  assert.deepEqual(rows.map(row => row.orden), Array.from({ length: 9 }, (_, index) => index));
  assert.equal(results.length, 8); assert.equal(publication.status, 'DISPONIBLE'); assert.equal(removals.length, 0);
});
test('multipart append accepts file only; missing/invalid/oversized/privileged fields do not alter registered files', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  const response = await attach(saved.id); assert.equal(response.status, 201); assert.match((await response.json()).data.id, /^[0-9a-f-]{36}$/i);
  for (const [bytes, extra] of [[null, false], [Buffer.from('fake'), false], [pdf, true]] as const) assert.equal((await attach(saved.id, bytes, extra)).status, 400);
  assert.equal((await attach(saved.id, Buffer.alloc(validation.DIGITAL_MAX_BYTES + 1))).status, 413);
  assert.equal((await service.getDigitalPublications(auth, saved.id))[0].files.length, 2); assert.equal(objects.size, 2);
});
test('only owner may append, institution remains authoritative and original campus stays in Storage paths', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file()), receiver = await peer();
  await assert.rejects(filesService.addDigitalAttachment(receiver, saved.id, file()), { status: 403 });
  const outsider = await peer(foreignCampus, foreignInstitution);
  await assert.rejects(filesService.addDigitalAttachment(outsider, saved.id, file()), { status: 404 });
  await switchCampus(sibling); assert.equal((await attach(saved.id)).status, 201); assert.ok(uploads[1].startsWith(`${campus}/${auth.userId}/${saved.id}/`));
  await db.query("update publicacion_recurso set estado_publicacion='OCULTO' where id=$1", [saved.id]);
  assert.equal((await attach(saved.id)).status, 409); assert.equal(objects.size, 2);
});
test('owner authorization and availability are rechecked after upload; rollback compensates only new file', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  onUpload = () => db.query("update publicacion_recurso set deleted_at=now() where id=$1", [saved.id]).then(() => {});
  await assert.rejects(filesService.addDigitalAttachment(auth, saved.id, file()), { status: 409 });
  assert.equal(objects.size, 1); assert.equal(removals.length, 1);
  assert.equal((await db.query('select id from archivo_publicacion where publicacion_id=$1', [saved.id])).rows.length, 1);
});
test('append Storage/SQL failures and uncertain COMMIT preserve existing files and recover persisted receipt', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  failUpload = true; await assert.rejects(filesService.addDigitalAttachment(auth, saved.id, file()), { status: 503 }); assert.equal(objects.size, 1);
  failUpload = false; failInsert = true; await assert.rejects(filesService.addDigitalAttachment(auth, saved.id, file()), { status: 503 }); assert.equal(objects.size, 1);
  failInsert = false; onUpload = async () => { lostCommit = true; };
  const result = await filesService.addDigitalAttachment(auth, saved.id, file()); assert.ok(result.id);
  assert.equal(objects.size, 2); assert.equal((await service.getDigitalPublications(auth, saved.id))[0].files.length, 2);
});
test('owner download returns bytes only with attachment/no-store/nosniff headers; mismatched IDs and other readers denied', async () => {
  const saved = await service.createDigitalPublication(auth, input(), { ...file(), name: "apuntes académicos's.pdf" });
  const response = await original(saved.id, saved.files[0].id); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-disposition')!, /^attachment; filename\*=UTF-8''apuntes%20acad%C3%A9micos%27s.pdf$/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  const other = await service.createDigitalPublication(auth, input(), file()); assert.equal((await original(saved.id, other.files[0].id)).status, 404);
  const receiver = await peer(); current = receiver;
  assert.equal((await original(saved.id, saved.files[0].id)).status, 403);
  current = await peer(foreignCampus, foreignInstitution); assert.equal((await original(saved.id, saved.files[0].id)).status, 404);
});
test('legitimate acquisition requires persisted access, matching completed transaction and both confirmations', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file()), receiver = await peer();
  const transactionId = await acquisition(saved.id, receiver.userId, 1); current = receiver;
  assert.equal((await original(saved.id, saved.files[0].id)).status, 403);
  await db.query("insert into confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) values($1,$2,'RECEPTOR')", [transactionId, receiver.userId]);
  assert.equal((await original(saved.id, saved.files[0].id)).status, 200);
  await db.query("update transaccion_recurso set estado_transaccion='PENDIENTE_CONFIRMACION',completada_en=null where id=$1", [transactionId]);
  assert.equal((await original(saved.id, saved.files[0].id)).status, 403);
  await db.query("update transaccion_recurso set estado_transaccion='COMPLETADA',completada_en=now() where id=$1", [transactionId]);
  await db.query('delete from acceso_recurso_digital where transaccion_id=$1', [transactionId]);
  assert.equal((await original(saved.id, saved.files[0].id)).status, 403);
});
test('acquired access survives owner/publication deactivation but never crosses institutions', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file()), receiver = await peer();
  await acquisition(saved.id, receiver.userId); current = receiver;
  await db.query("update perfil_usuario set estado_cuenta='DESACTIVADA' where id=$1", [auth.userId]);
  await db.query("update publicacion_recurso set deleted_at=now(),estado_publicacion='OCULTO' where id=$1", [saved.id]);
  assert.equal((await original(saved.id, saved.files[0].id)).status, 200);
  await db.query('update perfil_usuario set campus_id=$2,institucion_id=$3 where id=$1', [receiver.userId, foreignCampus, foreignInstitution]);
  current = { ...receiver, campusId: foreignCampus, profile: { ...receiver.profile, campus_id: foreignCampus, institucion_id: foreignInstitution } };
  assert.equal((await original(saved.id, saved.files[0].id)).status, 404);
});
test('download rechecks current account/acquisition after Storage I/O, and Storage failures return sanitized errors', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file()), receiver = await peer();
  await acquisition(saved.id, receiver.userId); current = receiver;
  onDownload = () => db.query('delete from acceso_recurso_digital where receptor_id=$1', [receiver.userId]).then(() => {});
  assert.equal((await original(saved.id, saved.files[0].id)).status, 403);
  current = structuredClone(auth); onDownload = null; failDownload = true;
  const failure = await original(saved.id, saved.files[0].id); assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /storage_path|password|private|digital-resources/);
  failDownload = false; corruptDownload = true; assert.equal((await original(saved.id, saved.files[0].id)).status, 503);
  corruptDownload = false; onDownload = () => db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1", [auth.userId]).then(() => {});
  assert.equal((await original(saved.id, saved.files[0].id)).status, 403); assert.equal(objects.size, 1);
});

test('stored routes outside the canonical publication prefix or traversal paths never reach Storage', async () => {
  const saved = await service.createDigitalPublication(auth, input(), file());
  const reference = (await db.query('select storage_path from archivo_publicacion where id=$1', [saved.files[0].id])).rows[0].storage_path;
  for (const path of [reference.replace(campus, foreignCampus), `${campus}/${auth.userId}/${saved.id}/../private.pdf`]) {
    await db.query('update archivo_publicacion set storage_path=$2 where id=$1', [saved.files[0].id, path]);
    const before = storageCalls.length; assert.equal((await original(saved.id, saved.files[0].id)).status, 404); assert.equal(storageCalls.length, before);
  }
});
