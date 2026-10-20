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
let uploads: string[], removals: string[], storageCalls: string[], logs: unknown[][];
let objects = new Map<string, Buffer>(), connectionLease = Promise.resolve();
let barriers = 0;

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
    assert.equal(init?.method, 'POST'); assert.ok(!url.pathname.includes('/sign/'));
    assert.equal(headers.get('content-type'), 'application/pdf'); assert.equal(headers.get('x-upsert'), 'false');
    const path = url.pathname.replace('/storage/v1/object/digital-resources/', '');
    uploads.push(path); objects.set(path, Buffer.from(init?.body as Uint8Array));
    await onUpload?.();
    return failUpload ? Response.json({ error: 'private failure' }, { status: 500 }) : Response.json({ Key: path, Id: randomUUID() });
  };
  service = await import('../src/modules/marketplace/elibrary/elibrary.service.js');
  validation = await import('../src/modules/marketplace/elibrary/elibrary.validation.js');
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'perfil_usuario', 'rol', 'usuario_rol', 'publicacion_recurso', 'recurso_digital', 'archivo_publicacion']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  // Restricciones adicionales observadas en remoto, aún ausentes en el snapshot histórico.
  await db.exec(`ALTER TABLE campus ADD UNIQUE(id,institucion_id);
    ALTER TABLE perfil_usuario ADD FOREIGN KEY(campus_id,institucion_id) REFERENCES campus(id,institucion_id);
    ALTER TABLE archivo_publicacion ADD UNIQUE(bucket_id,storage_path);
    ALTER TABLE publicacion_recurso ADD CHECK ((modalidad='VENTA' AND precio>0 AND precio IS NOT NULL) OR (modalidad='DONACION' AND precio IS NULL));
    ALTER TABLE publicacion_recurso ENABLE ROW LEVEL SECURITY; ALTER TABLE archivo_publicacion ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT ON publicacion_recurso,archivo_publicacion TO service_role;
    CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;`);
  await db.exec(await readFile('src/database/supabase/migrations/f2_5_01_publicacion_digital.sql', 'utf8'));
  await db.query('insert into institucion(id,nombre) values($1,$2),($3,$4)', [institution, 'Institución A', foreignInstitution, 'Institución B']);
  await db.query('insert into campus(id,institucion_id,nombre) values($1,$2,$3),($4,$2,$5),($6,$7,$8)',
    [campus, institution, 'Origen', sibling, 'Otra sede', foreignCampus, foreignInstitution, 'Ajeno']);
  await db.exec("insert into rol(nombre) values('USUARIO_AUTORIZADO'),('ADMINISTRADOR')");
  const document = await PDFDocument.create(); document.addPage().drawText('Apuntes academicos'); pdf = Buffer.from(await document.save());
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/marketplace/elibrary';
});
beforeEach(async () => {
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
  assert.deepEqual(data.files, [{ name: 'apuntes.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length }]);
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
test('metadata consultation grants no original-file endpoint or URL, including for owner', async () => {
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
