import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID();
const category = randomUUID(), career = randomUUID(), subject = randomUUID(), foreignCareer = randomUUID(), foreignSubject = randomUUID();
const token = 'physicalgoods.test.token';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYpQAAAAASUVORK5CYII=';
let auth: VerifiedAuthConnection, current: VerifiedAuthConnection;
let server: Server, base: string;
let create: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.service.js').createPhysicalgoods;
let options: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.service.js').getPhysicalgoodsOptions;
let photo: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.service.js').getPhysicalgoodsPhoto;
let parse: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.validation.js').parsePhysicalgoods;
let closePostgres: () => Promise<void>;
let storageCalls: { method: string; path: string; body?: unknown }[];
let uploads: string[], removals: string[], signed: string[];
let failUpload = false, failInsert = false, failRemove = false, publicBucket = false, missingBucket = false, lostCommit = false;
let onUpload: (() => Promise<void>) | null = null;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://physicalgoods-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_DB_URL: 'postgresql://postgres:simulated@physicalgoods-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => ({
    query: async (sql: string, values: unknown[] = []) => {
      if (failInsert && sql.startsWith('INSERT INTO public.archivo_publicacion')) throw new Error('private failed SQL password');
      const result = await db.query(sql, values);
      if (lostCommit && sql === 'COMMIT') { lostCommit = false; throw new Error('lost commit acknowledgement'); }
      return result;
    }, release: () => {},
  }));
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://physicalgoods-test.invalid');
    const headers = new Headers(init?.headers);
    if (!url.pathname.startsWith('/storage/v1/')) {
      assert.equal(headers.get('authorization'), 'Bearer ' + token);
      if (url.pathname === '/auth/v1/user') return Response.json({ id: current.userId, email: 'qa@duocuc.cl', email_confirmed_at: '2026-10-13T00:00:00Z' });
      if (url.pathname.endsWith('/perfil_usuario')) return Response.json([current.profile]);
      const kind = url.pathname.endsWith('/usuario_rol') ? 'rol' : 'permiso';
      return Response.json((kind === 'rol' ? current.roles : current.permissions).map(row => ({ campus_id: row.campusId, [kind]: { id: row.id, nombre: row.name } })));
    }
    assert.equal(headers.get('apikey'), 'sb_secret_test');
    const method = init?.method || 'GET'; storageCalls.push({ method, path: url.pathname });
    if (url.pathname === '/storage/v1/bucket/publication-images') return missingBucket
      ? Response.json({ statusCode: 404, error: 'Not Found', message: 'private detail' }, { status: 404 })
      : Response.json({ id: 'publication-images', name: 'publication-images', public: publicBucket });
    if (method === 'DELETE') {
      const body = JSON.parse(String(init?.body)); removals.push(...body.prefixes);
      return failRemove ? Response.json({ statusCode: 500, message: 'private Storage failure' }, { status: 500 }) : Response.json([]);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      signed.push(url.pathname); assert.deepEqual(JSON.parse(String(init?.body)), { expiresIn: 60 });
      return Response.json({ signedURL: '/object/sign/publication-images/mock?token=temporary' });
    }
    assert.equal(method, 'POST'); assert.equal(headers.get('content-type'), 'image/png'); assert.equal(headers.get('x-upsert'), 'false');
    const bytes = Buffer.from(init?.body as Uint8Array); assert.deepEqual(bytes, Buffer.from(png, 'base64'));
    uploads.push(url.pathname.replace('/storage/v1/object/publication-images/', ''));
    await onUpload?.();
    return failUpload ? Response.json({ statusCode: 500, error: 'failure', message: 'private details' }, { status: 500 }) : Response.json({ Key: url.pathname, Id: randomUUID() });
  };
  const services = await import('../src/modules/marketplace/physicalgoods/physicalgoods.service.js');
  create = services.createPhysicalgoods; options = services.getPhysicalgoodsOptions; photo = services.getPhysicalgoodsPhoto;
  ({ parsePhysicalgoods: parse } = await import('../src/modules/marketplace/physicalgoods/physicalgoods.validation.js'));
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'carrera', 'asignatura', 'campus_carrera', 'carrera_asignatura', 'perfil_usuario', 'rol', 'usuario_rol',
    'publicacion_recurso', 'categoria_recurso_fisico', 'recurso_fisico', 'archivo_publicacion', 'publicacion_carrera', 'publicacion_asignatura']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.query("insert into institucion(id,nombre) values($1,'Institution')", [institution]);
  await db.query("insert into campus(id,institucion_id,nombre) values($1,$2,'Home'),($3,$2,'Foreign')", [campus, institution, otherCampus]);
  await db.query("insert into categoria_recurso_fisico(id,nombre) values($1,'Material académico')", [category]);
  await db.query("insert into carrera(id,institucion_id,nombre) values($1,$2,'Home career'),($3,$2,'Foreign career')", [career, institution, foreignCareer]);
  await db.query('insert into campus_carrera values($1,$2),($3,$4)', [campus, career, otherCampus, foreignCareer]);
  await db.query("insert into asignatura(id,nombre,codigo) values($1,'Math','MATH'),($2,'Foreign subject','FOREIGN')", [subject, foreignSubject]);
  await db.query('insert into carrera_asignatura values($1,$2,1),($3,$4,1)', [career, subject, foreignCareer, foreignSubject]);
  await db.exec("insert into rol(nombre) values('USUARIO_AUTORIZADO'),('ADMINISTRADOR')");
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/marketplace/physicalgoods';
});
beforeEach(async () => {
  storageCalls = []; uploads = []; removals = []; signed = [];
  failUpload = failInsert = failRemove = publicBucket = missingBucket = lostCommit = false; onUpload = null;
  const userId = randomUUID();
  await db.query('insert into auth.users values($1)', [userId]);
  await db.query("insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values($1,$2,$3,'User',now())", [userId, institution, campus]);
  auth = { userId, campusId: campus, roles: [], permissions: [], profile: { id: userId, campus_id: campus, institucion_id: institution,
    nombre_completo: 'User', foto_path: null, verificado_en: '2026-10-13T00:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null } };
  current = structuredClone(auth);
});
after(async () => { globalThis.fetch = originalFetch; await new Promise<void>(resolve => server.close(() => resolve())); await closePostgres(); mock.restoreAll(); await db.close(); });
const input = (overrides: Record<string, unknown> = {}) => ({ title: ' Calculadora ', description: ' Funciona correctamente ', condition: 'BUEN_ESTADO',
  categoryId: category, modality: 'VENTA', price: 15000, careerId: career, subjectId: subject,
  photo: { name: 'principal.png', mimeType: 'image/png', base64: png }, ...overrides });
const rows = (name: string) => db.query('select * from public.' + name + ' where ' + (name === 'publicacion_recurso' ? 'propietario_id' : 'publicacion_id') + '=$1', [auth.userId]);
async function assertNoPublication() { assert.equal((await rows('publicacion_recurso')).rows.length, 0); }
async function post(body: unknown, authorization = 'Bearer ' + token) {
  return originalFetch(base, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('sale writes one physical unit and principal metadata/academic relations atomically using server owner/campus', async () => {
  const saved = await create(auth, input());
  assert.equal(saved.title, 'Calculadora'); assert.equal(saved.description, 'Funciona correctamente'); assert.equal(saved.status, 'DISPONIBLE');
  const publication = (await rows('publicacion_recurso')).rows[0];
  assert.equal(publication.id, saved.id); assert.equal(publication.tipo_recurso, 'FISICO'); assert.equal(publication.campus_id, campus); assert.equal(publication.propietario_id, auth.userId);
  assert.equal(Number(publication.precio), 15000); assert.equal(publication.moneda, 'CLP');
  for (const table of ['recurso_fisico', 'archivo_publicacion', 'publicacion_carrera', 'publicacion_asignatura']) {
    const result = (await db.query('select * from public.' + table + ' where publicacion_id=$1', [saved.id])).rows;
    assert.equal(result.length, 1, table);
  }
  const file = (await db.query('select * from archivo_publicacion where publicacion_id=$1', [saved.id])).rows[0];
  assert.equal(file.orden, 0); assert.equal(file.tipo_archivo, 'IMAGEN'); assert.equal(Number(file.tamano_bytes), Buffer.from(png, 'base64').length);
  assert.equal(file.bucket_id, 'publication-images'); assert.ok(String(file.storage_path).startsWith(campus + '/' + auth.userId + '/' + saved.id + '/'));
  assert.equal(removals.length, 0); assert.equal(uploads.length, 1);
});
test('donation stores NULL price and allows no academic associations', async () => {
  const saved = await create(auth, input({ modality: 'DONACION', price: null, careerId: null, subjectId: null }));
  assert.equal(saved.price, null); assert.equal((await rows('publicacion_recurso')).rows[0].precio, null);
  assert.equal((await db.query('select * from publicacion_carrera where publicacion_id=$1', [saved.id])).rows.length, 0);
});
test('validation rejects missing/invalid fields, modalities, prices, spoofed privileged fields and location without uploading', async () => {
  for (const overrides of [{ title: '' }, { description: '' }, { condition: 'INVALID' }, { categoryId: 'bad' }, { modality: ['VENTA', 'DONACION'] },
    { condition: { toString: 'invalid' } },
    ...[null, 0, -1, '1000', Infinity, NaN].map(price => ({ price })), { modality: 'DONACION', price: 0 }, { careerId: 'bad' }, { subjectId: 'bad' },
    { campusId: otherCampus }, { ownerId: randomUUID() }, { quantity: 2 }, { address: 'personal address' }, { status: 'RESERVADO' }, { photo: null }]) {
    await assert.rejects(create(auth, input(overrides)), { status: 400 });
  }
  assert.equal(storageCalls.length, 0); await assertNoPublication();
});
test('principal photo rejects arbitrary storage references, malformed base64, MIME mismatch and images over 5 MB', () => {
  for (const next of [{ ...input().photo, path: 'other/photo.png' }, { ...input().photo, name: '../principal.png' },
    { ...input().photo, mimeType: 'image/svg+xml' }, { ...input().photo, mimeType: { toString: 'invalid' } }, { ...input().photo, base64: 'invalid' }, { ...input().photo, mimeType: 'image/jpeg' },
    { ...input().photo, base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64') }]) assert.throws(() => parse(input({ photo: next })), { status: 400 });
  for (const [mimeType, bytes] of [['image/jpeg', Buffer.from([255, 216, 255, 217])], ['image/webp', Buffer.from('RIFFxxxxWEBPx')]] as const) {
    assert.equal(parse(input({ photo: { name: 'photo', mimeType, base64: bytes.toString('base64') } })).photo.mimeType, mimeType);
  }
});
test('catalog contains only active categories and careers/subjects offered in the persisted campus', async () => {
  const catalog = await options(auth);
  assert.equal(catalog.campus.id, campus); assert.deepEqual(catalog.careers.map(row => row.id), [career]); assert.deepEqual(catalog.subjects.map(row => row.id), [subject]);
  assert.deepEqual(catalog.subjects[0].careerIds, [career]);
  assert.deepEqual(Object.keys(catalog.campus).sort(), ['id', 'name']);
});
test('category/career/subject foreign, absent or inactive rolls back and removes the uploaded photo', async () => {
  for (const overrides of [{ categoryId: randomUUID() }, { careerId: foreignCareer }, { subjectId: foreignSubject }]) {
    await assert.rejects(create(auth, input(overrides)), { status: 400 }); await assertNoPublication();
  }
  await db.query('update categoria_recurso_fisico set activo=false where id=$1', [category]);
  try { await assert.rejects(create(auth, input()), { status: 400 }); } finally { await db.query('update categoria_recurso_fisico set activo=true where id=$1', [category]); }
  assert.equal(removals.length, uploads.length);
});
test('unverified/inactive actor is denied before Storage; verified accounts and explicit local authorized roles reuse general capability', async () => {
  for (const profile of [{ ...auth.profile, verificado_en: null }, { ...auth.profile, estado_cuenta: 'SUSPENDIDA' as const }, { ...auth.profile, deleted_at: '2026-10-13T00:00:00Z' }]) {
    await assert.rejects(create({ ...auth, profile }, input()), { status: 403 });
  }
  assert.equal(storageCalls.length, 0);
  await db.query('update perfil_usuario set verificado_en=null where id=$1', [auth.userId]);
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) select $1,id,$2 from rol where nombre='USUARIO_AUTORIZADO'", [auth.userId, campus]);
  const roles = [{ id: randomUUID(), name: 'USUARIO_AUTORIZADO', campusId: campus }];
  await create({ ...auth, profile: { ...auth.profile, verificado_en: null }, roles }, input());
});
test('account suspension or local role revocation during upload is rechecked inside the SQL transaction', async () => {
  onUpload = () => db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1", [auth.userId]).then(() => {});
  await assert.rejects(create(auth, input()), { status: 403 }); await assertNoPublication(); assert.equal(removals.length, 1);
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',verificado_en=null where id=$1", [auth.userId]);
  auth.profile.verificado_en = null; auth.roles = [{ id: randomUUID(), name: 'USUARIO_AUTORIZADO', campusId: campus }];
  onUpload = null; await assert.rejects(create(auth, input()), { status: 403 }); await assertNoPublication(); assert.equal(removals.length, 2);
});
test('campus change during upload causes conflict and never moves or publishes the resource', async () => {
  onUpload = () => db.query('update perfil_usuario set campus_id=$1 where id=$2', [otherCampus, auth.userId]).then(() => {});
  await assert.rejects(create(auth, input()), { status: 409 }); await assertNoPublication(); assert.equal(removals.length, 1);
});
test('insert failure rolls back publication/physical rows and compensates Storage; upload/bucket failure creates no DB rows', async () => {
  failInsert = true; await assert.rejects(create(auth, input()), { status: 503 }); await assertNoPublication(); assert.equal(removals.length, 1);
  assert.equal((await db.query('select * from recurso_fisico where publicacion_id=$1', [uploads[0].split('/')[2]])).rows.length, 0);
  failInsert = false; failUpload = true; await assert.rejects(create(auth, input()), { status: 503 }); await assertNoPublication();
  failUpload = false; publicBucket = true; await assert.rejects(create(auth, input()), { status: 503 }); await assertNoPublication();
  publicBucket = false; missingBucket = true; await assert.rejects(create(auth, input()), { status: 503 }); await assertNoPublication();
});
test('lost commit acknowledgement preserves a photo already referenced by committed rows', async () => {
  lostCommit = true; await assert.rejects(create(auth, input()), { status: 503 });
  assert.equal((await rows('publicacion_recurso')).rows.length, 1); assert.equal(removals.length, 0);
});
test('cleanup failure logs only the generated publication ID and preserves the safe public error', async () => {
  failInsert = true; failRemove = true;
  const messages: unknown[][] = [], original = console.error;
  console.error = (...args) => { messages.push(args); };
  try { await assert.rejects(create(auth, input()), { status: 503 }); } finally { console.error = original; }
  await assertNoPublication(); assert.equal(messages.length, 1);
  assert.ok(!/password|SQL|sb_secret/.test(JSON.stringify(messages)));
  assert.deepEqual(messages[0], ['Physical resource photo cleanup unavailable', { publicationId: uploads[0].split('/')[2] }]);
});
test('private photo signs for 60 seconds only for an accessible physical resource in the current campus', async () => {
  const saved = await create(auth, input());
  assert.equal((await photo(auth, saved.id)).expiresIn, 60); assert.equal(signed.length, 1);
  await assert.rejects(photo({ ...auth, campusId: otherCampus, profile: { ...auth.profile, campus_id: otherCampus } }, saved.id), { status: 404 });
  for (const state of ['OCULTO', 'CANCELADO']) {
    await db.query('update publicacion_recurso set estado_publicacion=$1 where id=$2', [state, saved.id]);
    await assert.rejects(photo(auth, saved.id), { status: 404 });
  }
  assert.equal(signed.length, 1);
});
test('HTTP requires identity before the large JSON body; 201/no-store uses common envelope and validation failures do not leak secrets', async () => {
  assert.equal((await post(input(), '')).status, 401); assert.equal(storageCalls.length, 0);
  assert.equal((await post({ ...input(), campusId: otherCampus })).status, 400);
  const response = await post(input()); assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
  const saved = (await response.json()).data; assert.equal(saved.campusId, campus); assert.equal(saved.ownerId, auth.userId);
  failUpload = true; const failure = await post(input()); assert.equal(failure.status, 503);
  const body = JSON.stringify(await failure.json()); assert.ok(!/private|password|sb_secret|SQL/.test(body));
});
test('migration is repeatable and blocks all direct public reads/writes without changing table columns or rows', async () => {
  const names = ['publicacion_recurso', 'recurso_fisico', 'archivo_publicacion', 'publicacion_carrera', 'publicacion_asignatura'];
  const beforeColumns = (await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  await db.exec('grant all on public.publicacion_recurso,public.recurso_fisico,public.archivo_publicacion,public.publicacion_carrera,public.publicacion_asignatura to anon,authenticated,public');
  const sql = await readFile('src/database/supabase/migrations/f2_4_01_publicacion_fisica.sql', 'utf8'); await db.exec(sql); await db.exec(sql);
  for (const name of names) {
    for (const role of ['anon', 'authenticated']) {
      const privileges = (await db.query<{ allowed: boolean }>("select has_table_privilege($1,$2,'SELECT') or has_table_privilege($1,$2,'INSERT') as allowed", [role, name])).rows[0];
      assert.equal(privileges.allowed, false);
    }
  }
  assert.deepEqual((await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows, beforeColumns);
});
test('large-body exception accepts a maximum-size photo and leaves other endpoints at the default JSON limit', async () => {
  const bytes = Buffer.alloc(5 * 1024 * 1024); Buffer.from(png, 'base64').copy(bytes);
  const maximum = input({ photo: { name: 'large.png', mimeType: 'image/png', base64: bytes.toString('base64') } });
  assert.equal(parse(maximum).photo.bytes.length, 5 * 1024 * 1024);
  // Stop at a field error after parsing so the Storage fixture remains a small real PNG.
  assert.equal((await post({ ...maximum, title: '' })).status, 400); assert.equal(storageCalls.length, 0);
  assert.equal((await post({ value: 'a'.repeat(8 * 1024 * 1024) })).status, 413);
  const response = await originalFetch(base.replace('/marketplace/physicalgoods', '/users/me/profile'), {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'a'.repeat(200000) }) });
  assert.equal(response.status, 413);
});
