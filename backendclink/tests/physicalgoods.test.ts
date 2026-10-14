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
let imagesService: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.images.service.js');
let storageCalls: { method: string; path: string; body?: unknown }[];
let uploads: string[], removals: string[], signed: string[];
let signedPaths: string[];
let failSign = false;
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
      signed.push(url.pathname);
      const body = JSON.parse(String(init?.body));
      if (Array.isArray(body.paths)) {
        assert.equal(body.expiresIn, 60); signedPaths.push(...body.paths);
        return failSign ? Response.json({ statusCode: 500, message: 'private Storage failure' }, { status: 500 })
          : Response.json(body.paths.map((path: string) => ({ path, error: null, signedURL: '/object/sign/publication-images/' + path + '?token=temporary' })));
      }
      assert.deepEqual(body, { expiresIn: 60 });
      return Response.json({ signedURL: '/object/sign/publication-images/mock?token=temporary' });
    }
    assert.equal(method, 'POST'); assert.equal(headers.get('content-type'), 'image/png'); assert.equal(headers.get('x-upsert'), 'false');
    const bytes = Buffer.from(init?.body as Uint8Array); assert.deepEqual(bytes, Buffer.from(png, 'base64'));
    uploads.push(url.pathname.replace('/storage/v1/object/publication-images/', ''));
    await onUpload?.();
    return failUpload ? Response.json({ statusCode: 500, error: 'failure', message: 'private details' }, { status: 500 }) : Response.json({ Key: url.pathname, Id: randomUUID() });
  };
  const services = await import('../src/modules/marketplace/physicalgoods/physicalgoods.service.js');
  imagesService = await import('../src/modules/marketplace/physicalgoods/physicalgoods.images.service.js');
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
  signedPaths = []; failSign = false;
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

test('gallery adds several referenced images, chooses one principal and legacy photo endpoint follows it', async () => {
  const saved = await create(auth, input());
  const second = await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const third = await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const gallery = await imagesService.getPhysicalgoodsGallery(auth, saved.id);
  assert.equal(gallery.canEdit, true); assert.equal(gallery.images.length, 3); assert.equal(gallery.category.id, category);
  assert.equal(gallery.images.filter(row => row.principal).length, 1); assert.equal(gallery.expiresIn, 60);
  await imagesService.changePhysicalgoodsPrincipal(auth, saved.id, third.id);
  const changed = await imagesService.getPhysicalgoodsGallery(auth, saved.id);
  assert.equal(changed.images[0].id, third.id); assert.equal(changed.images.filter(row => row.principal).length, 1);
  await photo(auth, saved.id); assert.ok(signed.at(-1)?.includes(third.id));
  assert.equal((await db.query('select orden from archivo_publicacion where id=$1', [second.id])).rows[0].orden, 1);
});
test('published images retire logically, bytes/references survive and deleting the principal selects a remaining image', async () => {
  const saved = await create(auth, input()), second = await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const before = await imagesService.getPhysicalgoodsGallery(auth, saved.id), principal = before.images[0].id;
  const deletes = removals.length;
  await imagesService.deletePhysicalgoodsImage(auth, saved.id, principal);
  const after = await imagesService.getPhysicalgoodsGallery(auth, saved.id);
  assert.equal(after.images.length, 1); assert.equal(after.images[0].id, second.id); assert.equal(after.images[0].principal, true);
  assert.ok((await db.query('select deleted_at from archivo_publicacion where id=$1', [principal])).rows[0].deleted_at);
  assert.equal(removals.length, deletes);
  await assert.rejects(imagesService.deletePhysicalgoodsImage(auth, saved.id, second.id), { status: 400 });
  await assert.rejects(imagesService.changePhysicalgoodsPrincipal(auth, saved.id, principal), { status: 404 });
});
test('category uses the existing active catalogue, appears in gallery and filters campus listings with safe pagination', async () => {
  const saved = await create(auth, input()), newCategory = randomUUID();
  await db.query("insert into categoria_recurso_fisico(id,nombre) values($1,'Tools test')", [newCategory]);
  await imagesService.changePhysicalgoodsCategory(auth, saved.id, { categoryId: newCategory });
  const gallery = await imagesService.getPhysicalgoodsGallery(auth, saved.id);
  assert.deepEqual(gallery.category, { id: newCategory, name: 'Tools test' });
  const list = await imagesService.getPhysicalgoodsResources(auth, { categoryId: newCategory, mine: 'true', page: '1', limit: '1' });
  assert.deepEqual(list.data.map(row => row.id), [saved.id]); assert.equal(list.meta.hasMore, false);
  assert.equal((await imagesService.getPhysicalgoodsResources(auth, { categoryId: category, mine: 'true' })).data.length, 0);
  await db.query('update categoria_recurso_fisico set activo=false where id=$1', [newCategory]);
  await assert.rejects(imagesService.changePhysicalgoodsCategory(auth, saved.id, { categoryId: newCategory }), { status: 400 });
  for (const query of [{ categoryId: 'bad' }, { page: '0' }, { limit: '101' }, { mine: 'false' }, { campusId: otherCampus }]) await assert.rejects(imagesService.getPhysicalgoodsResources(auth, query), { status: 400 });
});
test('ordinary campus users can view galleries but cannot alter another owner images or category', async () => {
  const owner = structuredClone(auth), saved = await create(owner, input());
  const viewer = await otherActor();
  const gallery = await imagesService.getPhysicalgoodsGallery(viewer, saved.id); assert.equal(gallery.canEdit, false);
  const calls = storageCalls.length;
  await assert.rejects(imagesService.addPhysicalgoodsImage(viewer, saved.id, { photo: input().photo }), { status: 403 });
  assert.equal(storageCalls.length, calls);
  await assert.rejects(imagesService.changePhysicalgoodsPrincipal(viewer, saved.id, gallery.images[0].id), { status: 403 });
  await assert.rejects(imagesService.deletePhysicalgoodsImage(viewer, saved.id, gallery.images[0].id), { status: 403 });
  await assert.rejects(imagesService.changePhysicalgoodsCategory(viewer, saved.id, { categoryId: category }), { status: 403 });
});
test('only an active administrator grant in the publication campus permits administrative mutation; cached grants are insufficient', async () => {
  const saved = await create(auth, input()), admin = await otherActor();
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) select $1,id,$2 from rol where nombre='ADMINISTRADOR'", [admin.userId, otherCampus]);
  admin.roles = [{ id: randomUUID(), name: 'ADMINISTRADOR', campusId: otherCampus }];
  await assert.rejects(imagesService.changePhysicalgoodsCategory(admin, saved.id, { categoryId: category }), { status: 403 });
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) select $1,id,$2 from rol where nombre='ADMINISTRADOR'", [admin.userId, campus]);
  admin.roles.push({ id: randomUUID(), name: 'ADMINISTRADOR', campusId: campus });
  const image = await imagesService.addPhysicalgoodsImage(admin, saved.id, { photo: input().photo });
  assert.equal((await imagesService.getPhysicalgoodsGallery(admin, saved.id)).canEdit, true);
  await imagesService.changePhysicalgoodsPrincipal(admin, saved.id, image.id);
  await db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1 and campus_id=$2', [admin.userId, campus]);
  await assert.rejects(imagesService.changePhysicalgoodsCategory(admin, saved.id, { categoryId: category }), { status: 403 });
});
test('image from another publication, foreign campus, digital, withdrawn or hidden resources never grant access', async () => {
  const first = await create(auth, input()), second = await create(auth, input());
  const image = (await imagesService.getPhysicalgoodsGallery(auth, second.id)).images[0].id;
  await assert.rejects(imagesService.changePhysicalgoodsPrincipal(auth, first.id, image), { status: 404 });
  await assert.rejects(imagesService.deletePhysicalgoodsImage(auth, first.id, image), { status: 404 });
  const foreign = { ...auth, campusId: otherCampus, profile: { ...auth.profile, campus_id: otherCampus } };
  await assert.rejects(imagesService.getPhysicalgoodsGallery(foreign, first.id), { status: 404 });
  assert.equal((await imagesService.getPhysicalgoodsResources(foreign, {})).data.length, 0);
  for (const update of ["estado_publicacion='OCULTO'", "deleted_at=now()", "tipo_recurso='DIGITAL'"]) {
    await db.query('update publicacion_recurso set ' + update + ' where id=$1', [first.id]);
    await assert.rejects(imagesService.getPhysicalgoodsGallery(auth, first.id), { status: 404 });
    await assert.rejects(imagesService.addPhysicalgoodsImage(auth, first.id, { photo: input().photo }), { status: 404 });
    await db.query("update publicacion_recurso set estado_publicacion='DISPONIBLE',deleted_at=null,tipo_recurso='FISICO' where id=$1", [first.id]);
  }
});
test('append revalidates suspension and campus changes during upload and compensates only the new image', async () => {
  const saved = await create(auth, input());
  onUpload = () => db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1", [auth.userId]).then(() => {});
  await assert.rejects(imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }), { status: 403 });
  assert.equal(removals.length, 1); assert.equal((await db.query('select * from archivo_publicacion where publicacion_id=$1', [saved.id])).rows.length, 1);
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1", [auth.userId]);
  onUpload = () => db.query('update perfil_usuario set campus_id=$1 where id=$2', [otherCampus, auth.userId]).then(() => {});
  await assert.rejects(imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }), { status: 409 });
  assert.equal(removals.length, 2);
});
test('failed image append preserves published resource and rejects untrusted Storage metadata before network I/O', async () => {
  const saved = await create(auth, input()); failInsert = true;
  await assert.rejects(imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }), { status: 503 });
  assert.equal((await rows('publicacion_recurso')).rows.length, 1); assert.equal((await imagesService.getPhysicalgoodsGallery(auth, saved.id)).images.length, 1); assert.equal(removals.length, 1);
  const count = storageCalls.length;
  for (const body of [{ photo: input().photo, ownerId: auth.userId }, { photo: { ...input().photo, storage_path: 'foreign.png' } }, { photo: null }]) await assert.rejects(imagesService.addPhysicalgoodsImage(auth, saved.id, body), { status: 400 });
  assert.equal(storageCalls.length, count);
});
test('HTTP image/gallery/category contracts require identity, scope references and retain bounded JSON parsing', async () => {
  const saved = await create(auth, input()), endpoint = base + '/' + saved.id + '/images';
  const append = (body: unknown, authorization = 'Bearer ' + token) => originalFetch(endpoint, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await append({ photo: input().photo }, '')).status, 401);
  const result = await append({ photo: input().photo }); assert.equal(result.status, 201);
  const gallery = await originalFetch(endpoint, { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(gallery.status, 200); assert.equal(gallery.headers.get('cache-control'), 'no-store'); assert.equal((await gallery.json()).data.images.length, 2);
  const list = await originalFetch(base + '?mine=true&categoryId=' + category + '&limit=1', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(list.status, 200); const page = await list.json(); assert.equal(page.data.length, 1); assert.equal(page.meta.limit, 1);
  assert.equal((await append({ value: 'a'.repeat(8 * 1024 * 1024) })).status, 413);
});

async function otherActor(): Promise<VerifiedAuthConnection> {
  const userId = randomUUID(); await db.query('insert into auth.users values($1)', [userId]);
  await db.query("insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values($1,$2,$3,'Other',now())", [userId, institution, campus]);
  return { ...auth, userId, roles: [], profile: { ...auth.profile, id: userId } };
}

test('search matches case-insensitive words across name/description and escapes wildcard characters as literal text', async () => {
  const book = await create(auth, input({ title: 'Libro integral', description: 'Ejercicios profesionales' }));
  const literal = await create(auth, input({ title: 'Material 100% _literal_ \\ especial', description: 'Otra publicación' }));
  const find = async (q: string) => (await imagesService.getPhysicalgoodsResources(auth, { q, mine: 'true' })).data.map(row => row.id);
  assert.deepEqual(await find(' LIBRO    profesionales '), [book.id]);
  assert.deepEqual(await find('integ EJERC'), [book.id]);
  for (const q of ['100%', '_literal_', '\\']) assert.deepEqual(await find(q), [literal.id]);
  assert.deepEqual(await find("' OR 1=1 --"), []);
  assert.deepEqual(await find('libro otra'), []);
});
test('search combines category, modality, condition, career, subject and inclusive sale price range without duplicate academic matches', async () => {
  const target = await create(auth, input({ title: 'Target resource', condition: 'NUEVO', price: 2000 }));
  await create(auth, input({ title: 'Wrong condition', condition: 'USADO', price: 2000 }));
  await create(auth, input({ title: 'Wrong price', condition: 'NUEVO', price: 3000 }));
  const extraCareer = randomUUID(), extraSubject = randomUUID();
  await db.query("insert into carrera(id,institucion_id,nombre) values($1,$2,'Extra career')", [extraCareer, institution]);
  await db.query("insert into asignatura(id,nombre,codigo) values($1,'Extra subject',$2)", [extraSubject, extraSubject]);
  await db.query('insert into publicacion_carrera values($1,$2)', [target.id, extraCareer]);
  await db.query('insert into publicacion_asignatura values($1,$2)', [target.id, extraSubject]);
  const filters = { mine: 'true', categoryId: category, modality: 'VENTA', condition: 'NUEVO', careerId: career, subjectId: subject, minPrice: '2000', maxPrice: '2000', limit: '1' };
  const result = await imagesService.getPhysicalgoodsResources(auth, filters);
  assert.deepEqual(result.data.map(row => row.id), [target.id]); assert.equal(result.meta.hasMore, false);
  assert.equal(result.data[0].condition, 'NUEVO'); assert.ok(result.data[0].imageUrl);
  assert.deepEqual((await imagesService.getPhysicalgoodsResources(auth, { ...filters, careerId: extraCareer, subjectId: extraSubject })).data.map(row => row.id), [target.id]);
  assert.equal((await imagesService.getPhysicalgoodsResources(auth, { ...filters, careerId: randomUUID() })).data.length, 0);
});
test('price filtering selects sales only, donation has no displayed price and invalid price/range/enum/identifier queries fail before Storage', async () => {
  const sale = await create(auth, input({ price: 5000 }));
  const donation = await create(auth, input({ modality: 'DONACION', price: null }));
  assert.deepEqual((await imagesService.getPhysicalgoodsResources(auth, { mine: 'true', minPrice: '0', maxPrice: '5000' })).data.map(row => row.id), [sale.id]);
  const gifts = await imagesService.getPhysicalgoodsResources(auth, { mine: 'true', modality: 'DONACION' });
  assert.deepEqual(gifts.data.map(row => row.id), [donation.id]); assert.equal(gifts.data[0].price, null);
  const calls = storageCalls.length;
  for (const query of [{ q: ['book'] }, { q: 'a'.repeat(201) }, { q: 'bad\nquery' }, { modality: 'BOTH' }, { condition: 'AVAILABLE' },
    { careerId: 'bad' }, { subjectId: 'bad' }, { minPrice: '-1' }, { maxPrice: 'NaN' }, { minPrice: 'Infinity' }, { minPrice: '100', maxPrice: '99' },
    { modality: 'DONACION', minPrice: '0' }, { minPrice: ['1', '2'] }, { maxPrice: '9007199254740992' }, { ownerId: auth.userId }, { status: 'RESERVADO' }]) {
    await assert.rejects(imagesService.getPhysicalgoodsResources(auth, query), { status: 400 });
  }
  assert.equal(storageCalls.length, calls);
});
test('search only discovers available physical resources in the current campus including mine and never signs excluded results', async () => {
  const marker = 'scope-' + auth.userId;
  const visible = await create(auth, input({ title: marker }));
  const excluded: string[] = [];
  for (const state of ['RESERVADO', 'FINALIZADO', 'OCULTO', 'CANCELADO']) {
    const row = await create(auth, input({ title: marker })); excluded.push(row.id);
    await db.query('update publicacion_recurso set estado_publicacion=$1 where id=$2', [state, row.id]);
  }
  for (const update of ['campus_id=$2', "tipo_recurso='DIGITAL'", 'deleted_at=now()']) {
    const row = await create(auth, input({ title: marker })); excluded.push(row.id);
    await db.query('update publicacion_recurso set ' + update + ' where id=$1', update.includes('$2') ? [row.id, otherCampus] : [row.id]);
  }
  const found = await imagesService.getPhysicalgoodsResources(auth, { q: marker });
  assert.deepEqual(found.data.map(row => row.id), [visible.id]);
  assert.deepEqual((await imagesService.getPhysicalgoodsResources(auth, { q: marker, mine: 'true' })).data.map(row => row.id), [visible.id]);
  assert.ok(signedPaths.every(path => path.includes(visible.id)));
  await db.query("update publicacion_recurso set estado_publicacion='RESERVADO' where id=$1", [visible.id]);
  assert.equal((await imagesService.getPhysicalgoodsResources(auth, { q: marker })).data.length, 0);
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth, visible.id)).status, 'RESERVADO');
});
test('search uses stable pagination and signs only principal photos in the returned page with no metadata/paths in resource DTO', async () => {
  const first = await create(auth, input()), second = await create(auth, input());
  const firstPage = await imagesService.getPhysicalgoodsResources(auth, { mine: 'true', limit: '1' });
  assert.equal(firstPage.data.length, 1); assert.equal(firstPage.meta.hasMore, true); assert.equal(signedPaths.length, 1);
  assert.ok(signedPaths[0].includes(firstPage.data[0].id));
  const next = await imagesService.getPhysicalgoodsResources(auth, { mine: 'true', limit: '1', page: '2' });
  assert.equal(next.meta.hasMore, false); assert.notEqual(next.data[0].id, firstPage.data[0].id);
  assert.deepEqual(new Set([firstPage.data[0].id, next.data[0].id]), new Set([first.id, second.id]));
  assert.doesNotMatch(JSON.stringify(firstPage.data), /storage_path|photo_bucket_id|propietario_id/);
  assert.equal((await imagesService.getPhysicalgoodsResources(auth, { mine: 'true', page: '999' })).data.length, 0);
});
test('search private image signing failures are safe and an absent principal reference still gives a recognizable result', async () => {
  const saved = await create(auth, input()); failSign = true;
  await assert.rejects(imagesService.getPhysicalgoodsResources(auth, { mine: 'true' }), { status: 503 });
  failSign = false; await db.query('update archivo_publicacion set deleted_at=now() where publicacion_id=$1', [saved.id]);
  const result = await imagesService.getPhysicalgoodsResources(auth, { mine: 'true' });
  assert.equal(result.data[0].title, 'Calculadora'); assert.equal(result.data[0].imageUrl, null);
});
test('HTTP search validates composed filters and uses updated current campus/account for the same bearer token', async () => {
  const saved = await create(auth, input({ title: 'Search HTTP case' }));
  const get = (query: string, authorization = 'Bearer ' + token) => originalFetch(base + '?' + query, { headers: { Authorization: authorization } });
  const response = await get('q=Search%20HTTP&modality=VENTA&condition=BUEN_ESTADO&careerId=' + career + '&subjectId=' + subject + '&minPrice=15000&maxPrice=15000');
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data.map((row: { id: string }) => row.id), [saved.id]);
  assert.equal((await get('q=Search', '')).status, 401);
  assert.equal((await get('minPrice=-1')).status, 400);
  current.profile.campus_id = otherCampus; current.campusId = otherCampus;
  const foreign = await get('q=Search%20HTTP'); assert.equal(foreign.status, 200); assert.equal((await foreign.json()).data.length, 0);
  current.profile.estado_cuenta = 'SUSPENDIDA'; assert.equal((await get('q=Search')).status, 403);
});
