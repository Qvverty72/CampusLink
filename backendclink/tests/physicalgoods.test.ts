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
let failAudit = false;
let editService: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.edit.service.js');
let requestsService: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.requests.service.js');
let failRequestInsert=false;
let connectionLease=Promise.resolve();
let failUpload = false, failInsert = false, failRemove = false, publicBucket = false, missingBucket = false, lostCommit = false;
let onUpload: (() => Promise<void>) | null = null;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://physicalgoods-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_DB_URL: 'postgresql://postgres:simulated@physicalgoods-test.invalid/postgres' });
  // PGlite ofrece una sola conexión: se conceden leases completos, como un pool de tamaño1.
  mock.method(Pool.prototype, 'connect', async () => {
    const previous=connectionLease;let releaseLease!:()=>void;
    connectionLease=new Promise<void>(resolve=>{releaseLease=resolve;});await previous;
    return {
    query: async (sql: string, values: unknown[] = []) => {
      if (failRequestInsert&&sql.startsWith('INSERT INTO public.solicitud_recurso')) throw new Error('private request SQL failure password');
      if (failAudit && sql.startsWith('INSERT INTO public.auditoria')) throw new Error('private audit SQL failure');
      if (failInsert && sql.startsWith('INSERT INTO public.archivo_publicacion')) throw new Error('private failed SQL password');
      const result = await db.query(sql, values);
      if (lostCommit && sql === 'COMMIT') { lostCommit = false; throw new Error('lost commit acknowledgement'); }
      return result;
    }, release: () => releaseLease(),
  }; });
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
      return failSign ? Response.json({ statusCode: 500, message: 'private Storage failure' }, { status: 500 })
        : Response.json({ signedURL: '/object/sign/publication-images/mock?token=temporary' });
    }
    assert.equal(method, 'POST'); assert.equal(headers.get('content-type'), 'image/png'); assert.equal(headers.get('x-upsert'), 'false');
    const bytes = Buffer.from(init?.body as Uint8Array); assert.deepEqual(bytes, Buffer.from(png, 'base64'));
    uploads.push(url.pathname.replace('/storage/v1/object/publication-images/', ''));
    await onUpload?.();
    return failUpload ? Response.json({ statusCode: 500, error: 'failure', message: 'private details' }, { status: 500 }) : Response.json({ Key: url.pathname, Id: randomUUID() });
  };
  const services = await import('../src/modules/marketplace/physicalgoods/physicalgoods.service.js');
  imagesService = await import('../src/modules/marketplace/physicalgoods/physicalgoods.images.service.js');
  editService = await import('../src/modules/marketplace/physicalgoods/physicalgoods.edit.service.js');
  requestsService=await import('../src/modules/marketplace/physicalgoods/physicalgoods.requests.service.js');
  create = services.createPhysicalgoods; options = services.getPhysicalgoodsOptions; photo = services.getPhysicalgoodsPhoto;
  ({ parsePhysicalgoods: parse } = await import('../src/modules/marketplace/physicalgoods/physicalgoods.validation.js'));
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'carrera', 'asignatura', 'campus_carrera', 'carrera_asignatura', 'perfil_usuario', 'rol', 'usuario_rol',
    'publicacion_recurso', 'categoria_recurso_fisico', 'recurso_fisico', 'archivo_publicacion', 'publicacion_carrera', 'publicacion_asignatura',
    'mensaje_solicitud','solicitud_recurso','transaccion_recurso','reporte_contenido','auditoria']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.exec(await readFile('src/database/supabase/migrations/f2_4_05_edicion_fisica.sql','utf8'));
  await db.exec(await readFile('src/database/supabase/migrations/f2_4_06_mensajes_solicitud.sql','utf8'));
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
  signedPaths = []; failSign = false; failAudit = false; failRequestInsert=false;
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
  // Detiene la prueba por error de campo después del parseo para conservar un PNG pequeño en Storage.
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

test('physical detail exposes current description, condition, sale price, campus and only minimal public owner data', async () => {
  const saved = await create(auth, input({ condition: 'NUEVO' }));
  await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  await db.query(`update perfil_usuario set nombre_completo='Current public name',foto_path='private-avatar',
    fecha_nacimiento='2000-01-01',region_origen='Private region',comuna_origen='Private district',genero='OTRO' where id=$1`, [auth.userId]);
  await db.query("update publicacion_recurso set descripcion='Actual description from database' where id=$1", [saved.id]);
  const viewer = await otherActor(), detail = await imagesService.getPhysicalgoodsGallery(viewer, saved.id);
  assert.equal(detail.title, 'Calculadora'); assert.equal(detail.description, 'Actual description from database');
  assert.equal(detail.condition, 'NUEVO'); assert.equal(detail.modality, 'VENTA'); assert.equal(detail.price, 15000);
  assert.deepEqual(detail.category, { id: category, name: 'Material académico' });
  assert.deepEqual(detail.owner, { id: auth.userId, fullName: 'Current public name' });
  assert.deepEqual(detail.campus, { id: campus, name: 'Home' });
  assert.equal(detail.status, 'DISPONIBLE'); assert.equal(detail.acceptsRequests, true); assert.equal(detail.canEdit, false);
  assert.equal(detail.images.length, 2); assert.equal(detail.images[0].principal, true); assert.equal(detail.expiresIn, 60);
  assert.deepEqual(Object.keys(detail).sort(), ['acceptsRequests','campus','canEdit','category','condition','description','expiresIn','id','images','modality','owner','price','status','title','updatedAt'].sort());
  assert.doesNotMatch(JSON.stringify(detail), /private-avatar|Private region|Private district|fecha_nacimiento|foto_path|email|storage_path|bucket_id|genero|verificado_en/);
});

test('donation detail has no sale price and publication campus stays original after owner changes campus', async () => {
  const saved = await create(auth, input({ modality: 'DONACION', price: null })), viewer = await otherActor();
  await db.query('update perfil_usuario set campus_id=$2 where id=$1', [auth.userId, otherCampus]);
  const detail = await imagesService.getPhysicalgoodsGallery(viewer, saved.id);
  assert.equal(detail.modality, 'DONACION'); assert.equal(detail.price, null); assert.equal(detail.acceptsRequests, true);
  assert.deepEqual(detail.campus, { id: campus, name: 'Home' }); assert.equal(detail.owner.id, auth.userId);
  const calls = signed.length;
  await assert.rejects(imagesService.getPhysicalgoodsGallery({ ...auth, campusId: otherCampus, profile: { ...auth.profile, campus_id: otherCampus } }, saved.id), { status: 404 });
  assert.equal(signed.length, calls);
});

test('detail rechecks current state and data after discovery and no longer accepts requests when reserved or completed', async () => {
  const saved = await create(auth, input());
  assert.equal((await imagesService.getPhysicalgoodsResources(auth, { mine: 'true' })).data[0].status, 'DISPONIBLE');
  for (const state of ['RESERVADO', 'FINALIZADO', 'DISPONIBLE']) {
    await db.query('update publicacion_recurso set estado_publicacion=$2,descripcion=$3 where id=$1', [saved.id, state, 'Updated ' + state]);
    const detail = await imagesService.getPhysicalgoodsGallery(auth, saved.id);
    assert.equal(detail.status, state); assert.equal(detail.description, 'Updated ' + state);
    assert.equal(detail.acceptsRequests, state === 'DISPONIBLE');
  }
  await db.query('update publicacion_recurso set deleted_at=now() where id=$1', [saved.id]);
  const calls = signed.length;
  await assert.rejects(imagesService.getPhysicalgoodsGallery(auth, saved.id), { status: 404 });
  assert.equal(signed.length, calls);
});

test('HTTP detail requires identity and current account/campus, conceals excluded resources and keeps no-store envelope', async () => {
  const saved = await create(auth, input());
  const get = (id: string, authorization = 'Bearer ' + token) => originalFetch(base + '/' + id + '/images', { headers: { Authorization: authorization } });
  assert.equal((await get(saved.id, '')).status, 401); assert.equal((await get('invalid')).status, 400);
  const response = await get(saved.id); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).data.owner.id, auth.userId);
  let calls = signed.length;
  for (const update of ["tipo_recurso='DIGITAL'", "estado_publicacion='OCULTO'", "estado_publicacion='CANCELADO'", 'deleted_at=now()']) {
    await db.query('update publicacion_recurso set ' + update + ' where id=$1', [saved.id]);
    const hidden = await get(saved.id); assert.equal(hidden.status, 404); assert.equal((await hidden.json()).error.code, 'NOT_FOUND');
    await db.query("update publicacion_recurso set tipo_recurso='FISICO',estado_publicacion='DISPONIBLE',deleted_at=null where id=$1", [saved.id]);
  }
  assert.equal(signed.length, calls);
  current.campusId = otherCampus; current.profile.campus_id = otherCampus; assert.equal((await get(saved.id)).status, 404);
  current.campusId = campus; current.profile.campus_id = campus;
  current.profile.estado_cuenta = 'SUSPENDIDA'; assert.equal((await get(saved.id)).status, 403); assert.equal(signed.length, calls);
});

test('detail safely reports private image failures and validates persisted campus paths before signing', async () => {
  const saved = await create(auth, input()); failSign = true;
  const response = await originalFetch(base + '/' + saved.id + '/images', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(response.status, 503); const body = await response.json(); assert.equal(body.error.code, 'DEPENDENCY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(body), /private Storage|secret|storage_path|password/);
  failSign = false; const calls = signed.length;
  await db.query('update archivo_publicacion set storage_path=$2 where publicacion_id=$1', [saved.id, otherCampus + '/foreign-private.png']);
  await assert.rejects(imagesService.getPhysicalgoodsGallery(auth, saved.id), { status: 503 }); assert.equal(signed.length, calls);
});

const updates = (detail: Awaited<ReturnType<typeof imagesService.getPhysicalgoodsGallery>>, overrides: Record<string,unknown> = {}) => ({
  title: detail.title, description: detail.description,condition: detail.condition,modality: detail.modality,price: detail.price,updatedAt: detail.updatedAt,...overrides,
});
const audits = async (id: string) => (await db.query<{ accion:string; datos_antes:Record<string,unknown>|null; datos_despues:Record<string,unknown> }>('select accion,datos_antes,datos_despues from auditoria where entidad_id=$1 order by created_at,id',[id])).rows;

test('owner updates physical content and converts sale to donation atomically without moving campus or academic associations', async () => {
  const saved = await create(auth,input()), original = await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  await editService.updatePhysicalgoods(auth,saved.id,updates(original,{title:' Nuevo nombre ',description:'Nueva descripción',condition:'USADO',modality:'DONACION',price:null}));
  const changed = await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  assert.equal(changed.title,'Nuevo nombre');assert.equal(changed.description,'Nueva descripción');assert.equal(changed.condition,'USADO');assert.equal(changed.price,null);assert.equal(changed.modality,'DONACION');assert.notEqual(changed.updatedAt,original.updatedAt);
  assert.equal(changed.campus.id,campus);assert.equal(changed.owner.id,auth.userId);assert.equal(changed.category.id,category);assert.equal(changed.images[0].id,original.images[0].id);
  assert.equal((await db.query('select carrera_id from publicacion_carrera where publicacion_id=$1',[saved.id])).rows[0].carrera_id,career);
  await editService.updatePhysicalgoods(auth,saved.id,updates(changed,{modality:'VENTA',price:2500}));
  const sale = await imagesService.getPhysicalgoodsGallery(auth,saved.id);assert.equal(sale.price,2500);
  const count = (await audits(saved.id)).length;await editService.updatePhysicalgoods(auth,saved.id,updates(sale));assert.equal((await audits(saved.id)).length,count);
});

test('update and withdrawal reject stale versions and spoofed/invalid data without changes or history', async () => {
  const saved = await create(auth,input()), detail = await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  for (const changes of [{ownerId:auth.userId},{campusId:otherCampus},{status:'RESERVADO'},{categoryId:category},{title:''},{condition:'INVALID'},{price:0},{modality:'DONACION',price:15000},{photo:input().photo},{updatedAt:'bad'}]) await assert.rejects(editService.updatePhysicalgoods(auth,saved.id,updates(detail,changes)),{status:400});
  await imagesService.addPhysicalgoodsImage(auth,saved.id,{photo:input().photo});const count = (await audits(saved.id)).length;
  await assert.rejects(editService.updatePhysicalgoods(auth,saved.id,updates(detail,{title:'Lost update'})),{status:409});
  await assert.rejects(editService.withdrawPhysicalgoods(auth,saved.id,{updatedAt:detail.updatedAt}),{status:409});
  assert.equal((await audits(saved.id)).length,count);assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).title,detail.title);
});

test('basic edit/withdrawal is owner-only even for admins and rechecks current account and campus under SQL lock', async () => {
  const saved = await create(auth,input()), detail = await imagesService.getPhysicalgoodsGallery(auth,saved.id), stranger = await otherActor();
  stranger.roles=[{id:randomUUID(),name:'ADMINISTRADOR',campusId:campus}];
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) select $1,id,$2 from rol where nombre='ADMINISTRADOR'",[stranger.userId,campus]);
  await assert.rejects(editService.updatePhysicalgoods(stranger,saved.id,updates(detail)),{status:403});
  await assert.rejects(editService.withdrawPhysicalgoods(stranger,saved.id,{updatedAt:detail.updatedAt}),{status:403});
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[auth.userId]);
  await assert.rejects(editService.updatePhysicalgoods(auth,saved.id,updates(detail)),{status:403});
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',campus_id=$2 where id=$1",[auth.userId,otherCampus]);
  await assert.rejects(editService.withdrawPhysicalgoods(auth,saved.id,{updatedAt:detail.updatedAt}),{status:409});
});

test('editing and logical withdrawal after reservation preserve agreed transaction terms, requests, files and complete history', async () => {
  const saved=await create(auth,input()), receiver=await otherActor(), requestId=randomUUID(),transactionId=randomUUID();
  await db.query("insert into mensaje_solicitud(codigo,descripcion) values($1,'Interested')",[requestId]);
  await db.query("insert into solicitud_recurso(id,publicacion_id,solicitante_id,estado_solicitud,codigo_mensaje) values($1,$2,$3,'ACEPTADA',$4)",[requestId,saved.id,receiver.userId,requestId]);
  await db.query("insert into transaccion_recurso(id,solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada,monto_acordado) values($1,$2,$3,$4,$5,'VENTA',15000)",[transactionId,requestId,saved.id,auth.userId,receiver.userId]);
  await db.query("update publicacion_recurso set estado_publicacion='RESERVADO' where id=$1",[saved.id]);
  const detail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  await editService.updatePhysicalgoods(auth,saved.id,updates(detail,{description:'Cambio posterior',modality:'DONACION',price:null}));
  const changed=await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  await editService.withdrawPhysicalgoods(auth,saved.id,{updatedAt:changed.updatedAt});
  const transaction=(await db.query('select * from transaccion_recurso where id=$1',[transactionId])).rows[0];
  assert.equal(transaction.modalidad_acordada,'VENTA');assert.equal(Number(transaction.monto_acordado),15000);assert.equal(transaction.estado_transaccion,'RESERVADA');
  assert.equal((await db.query('select estado_solicitud from solicitud_recurso where id=$1',[requestId])).rows[0].estado_solicitud,'ACEPTADA');
  const stored=(await rows('publicacion_recurso')).rows[0];assert.ok(stored.deleted_at);assert.equal(stored.estado_publicacion,'RESERVADO');assert.equal(stored.descripcion,'Cambio posterior');
  assert.equal((await db.query('select id from archivo_publicacion where publicacion_id=$1',[saved.id])).rows.length,1);assert.equal(removals.length,0);
  assert.equal((await imagesService.getPhysicalgoodsResources(auth,{mine:'true'})).data.length,0);await assert.rejects(photo(auth,saved.id),{status:404});await assert.rejects(imagesService.getPhysicalgoodsGallery(auth,saved.id),{status:404});
  const history=await audits(saved.id);assert.deepEqual(history.map(row=>row.accion),['PUBLICAR_PUBLICACION','EDITAR_PUBLICACION','RETIRAR_PUBLICACION']);
  assert.equal(history[1].datos_antes?.modalidad,'VENTA');assert.equal(history[1].datos_despues.modalidad,'DONACION');assert.equal(history[2].datos_antes?.deleted_at,null);assert.ok(history[2].datos_despues.deleted_at);
});

test('publication, image and category histories preserve prior snapshots and expose only authorized public audit fields', async () => {
  const saved=await create(auth,input()), second=await imagesService.addPhysicalgoodsImage(auth,saved.id,{photo:input().photo});
  await imagesService.changePhysicalgoodsPrincipal(auth,saved.id,second.id);
  const first=(await imagesService.getPhysicalgoodsGallery(auth,saved.id)).images[1].id;
  await imagesService.deletePhysicalgoodsImage(auth,saved.id,first);
  const newCategory=randomUUID();await db.query("insert into categoria_recurso_fisico(id,nombre) values($1,'New category')",[newCategory]);await imagesService.changePhysicalgoodsCategory(auth,saved.id,{categoryId:newCategory});
  const history=await audits(saved.id);assert.equal(history.length,5);assert.equal(history[0].datos_despues.categoria_id,category);assert.equal(history[4].datos_despues.categoria_id,newCategory);
  assert.equal((history[0].datos_despues.images as unknown[]).length,1);assert.equal((history[1].datos_despues.images as unknown[]).length,2);
  const {auditSnapshot}=await import('../src/modules/users/audit.snapshot.js');
  const projected=auditSnapshot({...history[4].datos_despues,password:'secret',images:[{id:second.id,orden:0,storage_path:'private',url:'secret'}]});
  assert.equal(projected?.categoria_id,newCategory);assert.equal(projected?.descripcion,'Funciona correctamente');assert.doesNotMatch(JSON.stringify(projected),/password|storage_path|secret/);
  const admin=await otherActor();await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) select $1,id,$2 from rol where nombre='ADMINISTRADOR'",[admin.userId,campus]);
  const entry=(await db.query('select id from auditoria where entidad_id=$1 order by created_at desc,id desc limit 1',[saved.id])).rows[0];
  await db.query("update publicacion_recurso set descripcion='Live data changed',deleted_at=now() where id=$1",[saved.id]);
  const {getAuditEntry}=await import('../src/modules/users/access.service.js');
  const historical=await getAuditEntry(admin,campus,entry.id);assert.equal((historical.datos_despues as Record<string,unknown>).descripcion,'Funciona correctamente');
  await assert.rejects(getAuditEntry(auth,campus,entry.id),{status:403});await assert.rejects(getAuditEntry(admin,otherCampus,entry.id),{status:403});
});

test('audit failures roll back content and file changes and compensate new uploads including publication creation', async () => {
  const saved=await create(auth,input()),detail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);failAudit=true;
  await assert.rejects(editService.updatePhysicalgoods(auth,saved.id,updates(detail,{title:'Rollback'})),{status:503});
  await assert.rejects(editService.withdrawPhysicalgoods(auth,saved.id,{updatedAt:detail.updatedAt}),{status:503});
  await assert.rejects(imagesService.addPhysicalgoodsImage(auth,saved.id,{photo:input().photo}),{status:503});
  await assert.rejects(create(auth,input()),{status:503});failAudit=false;
  const currentDetail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);assert.equal(currentDetail.title,detail.title);assert.equal(currentDetail.updatedAt,detail.updatedAt);assert.equal(currentDetail.images.length,1);
  assert.equal((await rows('publicacion_recurso')).rows.length,1);assert.equal((await audits(saved.id)).length,1);assert.equal(removals.length,2);
});

test('HTTP owner edits and withdraws with no-store, validation/authentication/conflicts and excluded resource protection', async () => {
  const saved=await create(auth,input()),detail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  const send=(method:string,body:unknown,authorization='Bearer '+token)=>originalFetch(base+'/'+saved.id,{method,headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send('PATCH',updates(detail),'')).status,401);assert.equal((await send('DELETE',{updatedAt:'invalid'})).status,400);
  const updated=await send('PATCH',updates(detail,{price:2000}));assert.equal(updated.status,200);assert.equal(updated.headers.get('cache-control'),'no-store');
  assert.equal((await send('DELETE',{updatedAt:detail.updatedAt})).status,409);
  const fresh=await imagesService.getPhysicalgoodsGallery(auth,saved.id);assert.equal((await send('DELETE',{updatedAt:fresh.updatedAt})).status,200);
  assert.equal((await send('PATCH',updates(fresh))).status,404);
});

test('physical edit migration is repeatable, changes no table/column/data and retains original audit actions', async () => {
  const saved=await create(auth,input());const inventory=()=>db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position");const before=await inventory();
  const sql=await readFile('src/database/supabase/migrations/f2_4_05_edicion_fisica.sql','utf8');await db.exec(sql);await db.exec(sql);assert.deepEqual((await inventory()).rows,before.rows);assert.equal((await audits(saved.id)).length,1);
  await db.query("insert into auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion) values($1,$2,$3,'publicacion_recurso',$4,'OCULTAR_PUBLICACION')",[auth.userId,institution,campus,saved.id]);
  await assert.rejects(db.query("insert into auditoria(institucion_id,entidad_tipo,entidad_id,accion) values($1,'x','x','UNKNOWN')",[institution]));
});

test('request uses server identity and publication origin, creates pending receipt and never reserves or changes the resource',async()=>{
  const saved=await create(auth,input()),requester=await otherActor(), before=await imagesService.getPhysicalgoodsGallery(auth,saved.id),calls=storageCalls.length;
  const options=await requestsService.getPhysicalgoodsRequestOptions(requester,saved.id);
  assert.equal(options.canRequest,true);assert.equal(options.activeRequest,null);assert.ok(['ME_INTERESA','PARA_MIS_ESTUDIOS','QUISIERA_SOLICITARLO'].every(code=>options.messages.some(row=>row.code===code)));
  const receipt=await requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'});
  assert.equal(receipt.publicationId,saved.id);assert.equal(receipt.requesterId,requester.userId);assert.equal(receipt.ownerId,auth.userId);assert.equal(receipt.campusId,campus);assert.equal(receipt.messageCode,'ME_INTERESA');assert.equal(receipt.status,'PENDIENTE');assert.match(receipt.requestedAt,/Z$/);
  const row=(await db.query('select * from solicitud_recurso where id=$1',[receipt.id])).rows[0];assert.equal(row.solicitante_id,requester.userId);assert.equal(row.publicacion_id,saved.id);
  assert.equal(storageCalls.length,calls);const after=await imagesService.getPhysicalgoodsGallery(auth,saved.id);assert.equal(after.status,'DISPONIBLE');assert.equal(after.updatedAt,before.updatedAt);assert.equal((await audits(saved.id)).length,1);
  assert.deepEqual((await requestsService.getPhysicalgoodsRequestOptions(requester,saved.id)).activeRequest,receipt);
  const another=await otherActor();assert.equal((await requestsService.getPhysicalgoodsRequestOptions(another,saved.id)).activeRequest,null);
  await requestsService.createPhysicalgoodsRequest(another,saved.id,{messageCode:'PARA_MIS_ESTUDIOS'});
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,2);
});

test('active pending/accepted requests block duplicates, closed rows remain historical and permit a new request',async()=>{
  const saved=await create(auth,input()),requester=await otherActor();
  const first=await requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'});
  for(const status of ['PENDIENTE','ACEPTADA']){
    await db.query('update solicitud_recurso set estado_solicitud=$2 where id=$1',[first.id,status]);
    await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'QUISIERA_SOLICITARLO'}),{status:409});
    const options=await requestsService.getPhysicalgoodsRequestOptions(requester,saved.id);assert.equal(options.canRequest,false);assert.equal(options.activeRequest?.id,first.id);assert.equal(options.messages.length,0);
  }
  await db.query("update solicitud_recurso set estado_solicitud='RECHAZADA' where id=$1",[first.id]);
  const second=await requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'QUISIERA_SOLICITARLO'});assert.notEqual(second.id,first.id);
  await db.query("update solicitud_recurso set estado_solicitud='CANCELADA' where id=$1",[second.id]);
  const third=await requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'});assert.notEqual(third.id,second.id);
  const historical=(await db.query('select * from solicitud_recurso where id=$1',[first.id])).rows[0];assert.equal(historical.estado_solicitud,'RECHAZADA');assert.equal(historical.codigo_mensaje,'ME_INTERESA');
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,3);
});

test('own resources, foreign campus, digital/withdrawn resources and changed states cannot receive requests',async()=>{
  const saved=await create(auth,input()),requester=await otherActor();
  assert.equal((await requestsService.getPhysicalgoodsRequestOptions(auth,saved.id)).canRequest,false);
  await assert.rejects(requestsService.createPhysicalgoodsRequest(auth,saved.id,{messageCode:'ME_INTERESA'}),{status:403});
  for(const state of ['RESERVADO','FINALIZADO']){
    await db.query('update publicacion_recurso set estado_publicacion=$2 where id=$1',[saved.id,state]);
    assert.equal((await requestsService.getPhysicalgoodsRequestOptions(requester,saved.id)).canRequest,false);
    await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:409});
  }
  for(const update of ["estado_publicacion='OCULTO'","estado_publicacion='CANCELADO'","tipo_recurso='DIGITAL'",'deleted_at=now()']){
    await db.query("update publicacion_recurso set estado_publicacion='DISPONIBLE',tipo_recurso='FISICO',deleted_at=null where id=$1",[saved.id]);await db.query('update publicacion_recurso set '+update+' where id=$1',[saved.id]);
    await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:404});
  }
  await db.query("update publicacion_recurso set estado_publicacion='DISPONIBLE',tipo_recurso='FISICO',deleted_at=null,campus_id=$2 where id=$1",[saved.id,otherCampus]);
  await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:404});
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,0);
});

test('request rejects free text and privileged fields and validates the chosen active catalogue message at submission time',async()=>{
  const saved=await create(auth,input()),requester=await otherActor(),code=randomUUID();
  await db.query("insert into mensaje_solicitud(codigo,descripcion) values($1,'Temporary option')",[code]);
  assert.ok((await requestsService.getPhysicalgoodsRequestOptions(requester,saved.id)).messages.some(row=>row.code===code));await db.query('update mensaje_solicitud set activo=false where codigo=$1',[code]);
  for(const body of [null,[],{messageCode:['ME_INTERESA']},{messageCode:''},{messageCode:'x\n'},{messageCode:'UNKNOWN'},{messageCode:code},{messageCode:"' OR 1=1 --"},
    ...['requesterId','ownerId','campusId','status','requestedAt','description','message','publicationId'].map(key=>({messageCode:'ME_INTERESA',[key]:'spoofed'}))]){
    await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,body),{status:400});
  }
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,0);
});

test('request rechecks persisted suspension, current campus and revoked authorized grants after middleware',async()=>{
  const saved=await create(auth,input()),requester=await otherActor();
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[requester.userId]);
  await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:403});
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',campus_id=$2 where id=$1",[requester.userId,otherCampus]);
  await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:409});
  await db.query('update perfil_usuario set campus_id=$2,verificado_en=null where id=$1',[requester.userId,campus]);
  requester.roles=[{id:randomUUID(),name:'USUARIO_AUTORIZADO',campusId:campus}];requester.profile.verificado_en=null;
  await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:403});
});

test('HTTP request options and submission require identity, preserve no-store and serialize double submissions',async()=>{
  const saved=await create(auth,input()),requester=await otherActor();current=structuredClone(requester);
  const endpoint=base+'/'+saved.id;
  assert.equal((await originalFetch(endpoint+'/request-options')).status,401);
  const options=await originalFetch(endpoint+'/request-options',{headers:{Authorization:'Bearer '+token}});assert.equal(options.status,200);assert.equal(options.headers.get('cache-control'),'no-store');
  const submit=()=>originalFetch(endpoint+'/requests',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messageCode:'ME_INTERESA'})});
  const responses=await Promise.all([submit(),submit()]);assert.deepEqual(responses.map(row=>row.status).sort(),[201,409]);
  const success=responses.find(row=>row.status===201)!;assert.equal(success.headers.get('cache-control'),'no-store');assert.equal((await success.json()).data.requesterId,requester.userId);
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,1);
  current.profile.campus_id=otherCampus;current.campusId=otherCampus;assert.equal((await submit()).status,409);
});

test('request persistence failure rolls back and an uncertain successful commit is discovered without duplicating the request',async()=>{
  const saved=await create(auth,input()),requester=await otherActor();failRequestInsert=true;
  await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:503});failRequestInsert=false;
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,0);
  lostCommit=true;await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:503});
  const found=await requestsService.getPhysicalgoodsRequestOptions(requester,saved.id);assert.ok(found.activeRequest);assert.equal(found.canRequest,false);
  await assert.rejects(requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),{status:409});
  assert.equal((await db.query('select id from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.length,1);
});

test('HTTP request errors sanitize dependencies and account changes while prior requests remain intact after withdrawal',async()=>{
  const owner=structuredClone(auth),saved=await create(owner,input()),requester=await otherActor();current=structuredClone(requester);failRequestInsert=true;
  const response=await originalFetch(base+'/'+saved.id+'/requests',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messageCode:'ME_INTERESA'})});
  assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/private request|password|SQL/);failRequestInsert=false;
  const receipt=await requestsService.createPhysicalgoodsRequest(requester,saved.id,{messageCode:'ME_INTERESA'}),detail=await imagesService.getPhysicalgoodsGallery(owner,saved.id);
  await editService.withdrawPhysicalgoods(owner,saved.id,{updatedAt:detail.updatedAt});assert.equal((await db.query('select id from solicitud_recurso where id=$1',[receipt.id])).rows.length,1);
  await assert.rejects(requestsService.getPhysicalgoodsRequestOptions(requester,saved.id),{status:404});
  current.profile.estado_cuenta='SUSPENDIDA';assert.equal((await originalFetch(base+'/'+saved.id+'/request-options',{headers:{Authorization:'Bearer '+token}})).status,403);
});

test('request message seed is repeatable, adds no attributes and preserves existing/inactive catalogues',async()=>{
  const isolated=new PGlite();try{
    await isolated.exec("create table mensaje_solicitud(codigo text primary key,descripcion text not null,activo boolean not null default true)");
    const inventory=()=>isolated.query("select column_name from information_schema.columns where table_name='mensaje_solicitud' order by ordinal_position");const before=await inventory();
    const sql=await readFile('src/database/supabase/migrations/f2_4_06_mensajes_solicitud.sql','utf8');await isolated.exec(sql);await isolated.exec(sql);
    assert.equal((await isolated.query('select * from mensaje_solicitud')).rows.length,3);assert.deepEqual((await inventory()).rows,before.rows);
    await isolated.exec("delete from mensaje_solicitud;insert into mensaje_solicitud values('CUSTOM','Approved existing message',false)");await isolated.exec(sql);
    assert.deepEqual((await isolated.query('select * from mensaje_solicitud')).rows,[{codigo:'CUSTOM',descripcion:'Approved existing message',activo:false}]);
  }finally{await isolated.close();}
});
