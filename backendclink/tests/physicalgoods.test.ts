import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import {Db} from 'mongodb';
import type {CampusMapDocument} from '../src/modules/maps/map.types.js';
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
let transactionsService: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.transactions.service.js');
let historyService: typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.history.service.js');
let remindersService:typeof import('../src/modules/marketplace/physicalgoods/physicalgoods.reminders.service.js');
let notificationsService:typeof import('../src/modules/users/notifications.service.js');
let reportsService:typeof import('../src/modules/reports/reports.physicalgoods.service.js');
let failTransactionInsert=false;
let failRatingInsert=false,lostRatingCommit=false;
let failReportInsert=false,lostReportCommit=false;
let failCoordination=false,failMap=false,lostCoordinationCommit=false,mapReads=0;
let activeMap:CampusMapDocument|null,onMapRead:(()=>Promise<void>)|null=null;
let failRequestInsert=false;
let connectionLease=Promise.resolve();
let failUpload = false, failInsert = false, failRemove = false, publicBucket = false, missingBucket = false, lostCommit = false;
let onUpload: (() => Promise<void>) | null = null;
let onReminderCandidates:(()=>Promise<void>)|null=null;

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
      if(failReportInsert&&sql.startsWith('INSERT INTO public.reporte_contenido'))throw new Error('private report SQL password');
      if(failRatingInsert&&sql.startsWith('INSERT INTO public.valoracion'))throw new Error('private rating SQL password');
      if(failCoordination&&sql.startsWith('INSERT INTO public.notificacion'))throw new Error('private notification SQL password');
      if (failTransactionInsert&&sql.startsWith('INSERT INTO public.transaccion_recurso')) throw new Error('private transaction SQL password');
      if (failRequestInsert&&sql.startsWith('INSERT INTO public.solicitud_recurso')) throw new Error('private request SQL failure password');
      if (failAudit && sql.startsWith('INSERT INTO public.auditoria')) throw new Error('private audit SQL failure');
      if (failInsert && sql.startsWith('INSERT INTO public.archivo_publicacion')) throw new Error('private failed SQL password');
      const result = await db.query(sql, values);
      if(onReminderCandidates&&sql.includes('ORDER BY p.publicado_en,p.id LIMIT 100')){
        const operation=onReminderCandidates;onReminderCandidates=null;await operation();
      }
      if(lostCoordinationCommit&&sql.startsWith('INSERT INTO public.notificacion')){lostCoordinationCommit=false;lostCommit=true;}
      if(lostRatingCommit&&sql.startsWith('INSERT INTO public.valoracion')){lostRatingCommit=false;lostCommit=true;}
      if(lostReportCommit&&sql.startsWith('INSERT INTO public.reporte_contenido')){lostReportCommit=false;lostCommit=true;}
      if (lostCommit && sql === 'COMMIT') { lostCommit = false; throw new Error('lost commit acknowledgement'); }
      return result;
    }, release: () => releaseLease(),
  }; });
  mock.method(Db.prototype,'collection',function(name:string){
    assert.equal(name,'campus_maps');return {findOne:async(filter:unknown)=>{
      mapReads++;assert.deepEqual(filter,{campusId:campus,status:'ACTIVE'});
      if(failMap)throw new Error('private Mongo URI password');
      if(onMapRead){const operation=onMapRead;onMapRead=null;await operation();}
      return activeMap;
    }};
  });
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
  transactionsService=await import('../src/modules/marketplace/physicalgoods/physicalgoods.transactions.service.js');
  historyService=await import('../src/modules/marketplace/physicalgoods/physicalgoods.history.service.js');
  remindersService=await import('../src/modules/marketplace/physicalgoods/physicalgoods.reminders.service.js');
  notificationsService=await import('../src/modules/users/notifications.service.js');
  reportsService=await import('../src/modules/reports/reports.physicalgoods.service.js');
  create = services.createPhysicalgoods; options = services.getPhysicalgoodsOptions; photo = services.getPhysicalgoodsPhoto;
  ({ parsePhysicalgoods: parse } = await import('../src/modules/marketplace/physicalgoods/physicalgoods.validation.js'));
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'carrera', 'asignatura', 'campus_carrera', 'carrera_asignatura', 'perfil_usuario', 'rol', 'usuario_rol',
    'publicacion_recurso', 'categoria_recurso_fisico', 'recurso_fisico', 'archivo_publicacion', 'publicacion_carrera', 'publicacion_asignatura',
    'mensaje_solicitud','solicitud_recurso','transaccion_recurso','confirmacion_transaccion','valoracion','notificacion','reporte_contenido','auditoria']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.exec(await readFile('src/database/supabase/migrations/f2_4_05_edicion_fisica.sql','utf8'));
  await db.exec(await readFile('src/database/supabase/migrations/f2_4_06_mensajes_solicitud.sql','utf8'));
  await db.exec(await readFile('src/database/supabase/migrations/f2_6_08_notificaciones.sql','utf8'));
  await db.exec('ALTER TABLE public.valoracion ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.valoracion TO service_role;');
  await db.exec('ALTER TABLE public.reporte_contenido ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.reporte_contenido TO service_role;');
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
  failTransactionInsert=false;
  failRatingInsert=lostRatingCommit=false;
  failReportInsert=lostReportCommit=false;
  failCoordination=failMap=lostCoordinationCommit=false;mapReads=0;onMapRead=null;
  activeMap={campusId:campus,version:1,status:'ACTIVE',createdAt:new Date(),updatedAt:new Date(),buildings:[
    {id:'ebuilding',name:'Edificio E',floors:[{id:'ebuilding_floor1',name:'Planta Baja'},{id:'ebuilding_floor2',name:'Piso 2'}]},
    {id:'cabin01',name:'Cabaña C',floors:[{id:'cabin01_floor1',name:'Piso -3'}]},
  ]};
  failUpload = failInsert = failRemove = publicBucket = missingBucket = lostCommit = false; onUpload = null;
  onReminderCandidates=null;
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
test('image capacity includes the principal, rejects a fourth before Storage and releases a retired slot', async () => {
  const saved = await create(auth, input());
  await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const third = await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const before = await imagesService.getPhysicalgoodsGallery(auth, saved.id), calls = storageCalls.length;
  const admin = await otherActor('ADMINISTRADOR');
  for (const actor of [auth, admin]) {
    await assert.rejects(imagesService.addPhysicalgoodsImage(actor, saved.id, { photo: input().photo }),
      { status: 409, message: /máximo de 3 imágenes/ });
  }
  assert.equal(storageCalls.length, calls);
  assert.deepEqual((await imagesService.getPhysicalgoodsGallery(auth, saved.id)).images.map(row => row.id), before.images.map(row => row.id));
  await imagesService.deletePhysicalgoodsImage(auth, saved.id, third.id);
  const replacement = await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const after = await imagesService.getPhysicalgoodsGallery(auth, saved.id);
  assert.equal(after.images.length, 3); assert.ok(after.images.some(row => row.id === replacement.id));
  assert.equal(after.images.filter(row => row.principal).length, 1); assert.equal(after.images[0].id, before.images[0].id);
  const history = await db.query('SELECT id,deleted_at FROM archivo_publicacion WHERE publicacion_id=$1', [saved.id]);
  assert.equal(history.rows.length, 4); assert.ok(history.rows.find(row => row.id === third.id)?.deleted_at);
});
test('competing uploads for the last image slot persist only one and compensate the unreferenced file', { timeout: 10000 }, async () => {
  const saved = await create(auth, input());
  await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  const before = uploads.length;
  let arrived = 0, release!: () => void;
  const bothUploaded = new Promise<void>(resolve => { release = resolve; });
  // Ambas cargas superan el precheck con dos fotos; compiten después por el mismo cupo bajo lock.
  onUpload = async () => { if (++arrived === 2) release(); await bothUploaded; };
  const results = await Promise.allSettled([
    imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }),
    imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }),
  ]);
  onUpload = null;
  assert.equal(arrived, 2); assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const failure = results.find(row => row.status === 'rejected');
  assert.ok(failure?.status === 'rejected'); assert.equal(failure.reason.status, 409);
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth, saved.id)).images.length, 3);
  assert.equal(uploads.length, before + 2); assert.equal(removals.length, 1);
  assert.equal((await db.query('SELECT id FROM archivo_publicacion WHERE storage_path=$1', [removals[0]])).rows.length, 0);
});
test('legacy publications above the image limit retain their gallery and allow additions only after freeing capacity', async () => {
  const saved = await create(auth, input());
  // Representa datos anteriores al nuevo límite sin usar la API que ahora lo impide.
  for (let order = 1; order <= 3; order++) {
    const id = randomUUID();
    await db.query(`INSERT INTO archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
      VALUES($1,$2,'publication-images',$3,'legacy.png','image/png',$4,'IMAGEN',$5)`,
    [id, saved.id, `${campus}/${auth.userId}/${saved.id}/${id}.png`, Buffer.from(png, 'base64').length, order]);
  }
  const legacy = await imagesService.getPhysicalgoodsGallery(auth, saved.id), calls = storageCalls.length;
  assert.equal(legacy.images.length, 4);
  await assert.rejects(imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }), { status: 409 });
  assert.equal(storageCalls.length, calls);
  await imagesService.deletePhysicalgoodsImage(auth, saved.id, legacy.images[3].id);
  await assert.rejects(imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo }), { status: 409 });
  await imagesService.deletePhysicalgoodsImage(auth, saved.id, legacy.images[2].id);
  await imagesService.addPhysicalgoodsImage(auth, saved.id, { photo: input().photo });
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth, saved.id)).images.length, 3);
  assert.equal((await db.query('SELECT id FROM archivo_publicacion WHERE publicacion_id=$1', [saved.id])).rows.length, 5);
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
  assert.equal((await append({ photo: input().photo })).status, 201);
  const calls = storageCalls.length, full = await append({ photo: input().photo });
  assert.equal(full.status, 409); assert.equal(full.headers.get('cache-control'), 'no-store');
  const error = await full.json(); assert.equal(error.error.code, 'CONFLICT'); assert.match(error.error.message, /máximo de 3 imágenes/);
  assert.equal(storageCalls.length, calls);
  assert.equal((await append({ value: 'a'.repeat(8 * 1024 * 1024) })).status, 413);
});

async function otherActor(role?:'ADMINISTRADOR'|'USUARIO_AUTORIZADO'): Promise<VerifiedAuthConnection> {
  const userId = randomUUID(); await db.query('insert into auth.users values($1)', [userId]);
  await db.query("insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values($1,$2,$3,'Other',now())", [userId, institution, campus]);
  const roles:VerifiedAuthConnection['roles']=[];
  if(role){
    const row=(await db.query<{id:string}>('SELECT id FROM rol WHERE nombre=$1',[role])).rows[0];
    await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) VALUES($1,$2,$3)',[userId,row.id,campus]);
    roles.push({id:row.id,name:role,campusId:campus});
  }
  return { ...auth, userId, roles, profile: { ...auth.profile, id: userId } };
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

async function requestedPair() {
  const saved=await create(auth,input()),first=await otherActor(),second=await otherActor();
  const a=await requestsService.createPhysicalgoodsRequest(first,saved.id,{messageCode:'ME_INTERESA'});
  const b=await requestsService.createPhysicalgoodsRequest(second,saved.id,{messageCode:'PARA_MIS_ESTUDIOS'});
  return {saved,first,second,a,b};
}
const resolveRequest=(publicationId:string,requestId:string,decision='ACEPTAR',actor=auth)=>requestsService.resolvePhysicalgoodsRequest(actor,publicationId,requestId,{decision});
const transactionRows=(publicationId:string)=>db.query('select * from transaccion_recurso where publicacion_id=$1 order by iniciada_en,id',[publicationId]);

test('acceptance snapshots agreed terms and reserves exactly one unit while other requests stay pending and visible',async()=>{
  const {saved,first,second,a,b}=await requestedPair(),before=await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  const result=await resolveRequest(saved.id,a.id);assert.equal(result.request.status,'ACEPTADA');assert.ok(result.transaction);
  assert.deepEqual(result.transaction,{id:result.transaction.id,status:'RESERVADA',modality:'VENTA',amount:15000,currency:'CLP'});
  const transaction=(await transactionRows(saved.id)).rows[0];assert.equal(transaction.solicitud_id,a.id);assert.equal(transaction.propietario_id,auth.userId);assert.equal(transaction.receptor_id,first.userId);
  const after=await imagesService.getPhysicalgoodsGallery(auth,saved.id);assert.equal(after.status,'RESERVADO');assert.notEqual(after.updatedAt,before.updatedAt);
  assert.equal((await requestsService.getPhysicalgoodsRequestOptions(second,saved.id)).activeRequest?.id,b.id);
  assert.equal((await requestsService.getPhysicalgoodsRequestOptions(second,saved.id)).activeRequest?.status,'PENDIENTE');
  assert.equal((await requestsService.getPhysicalgoodsRequestOptions(first,saved.id)).activeRequest?.status,'ACEPTADA');
  assert.equal((await imagesService.getPhysicalgoodsResources(auth,{mine:'true'})).data.some(row=>row.id===saved.id),false);
  const received=await requestsService.getReceivedPhysicalgoodsRequests(auth,{});assert.equal(received.data.length,2);assert.ok(received.data.every(row=>row.publication.status==='RESERVADO'));
  assert.equal(received.data.find(row=>row.id===b.id)?.transaction,null);
  const history=await audits(saved.id);assert.equal(history.length,2);assert.equal(history[1].datos_antes.estado_publicacion,'DISPONIBLE');assert.equal(history[1].datos_despues.estado_publicacion,'RESERVADO');
});

test('rejection only changes the selected pending request and preserves its message, date and history',async()=>{
  const {saved,first,a,b}=await requestedPair(),before=await imagesService.getPhysicalgoodsGallery(auth,saved.id);
  const result=await resolveRequest(saved.id,a.id,'RECHAZAR');assert.equal(result.request.status,'RECHAZADA');assert.equal(result.transaction,null);
  const selected=(await db.query('select * from solicitud_recurso where id=$1',[a.id])).rows[0];assert.equal(selected.codigo_mensaje,a.messageCode);assert.ok(selected.updated_at);assert.ok(selected.solicitada_en);
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).updatedAt,before.updatedAt);assert.equal((await transactionRows(saved.id)).rows.length,0);
  await assert.rejects(resolveRequest(saved.id,a.id),{status:409});
  const another=await requestsService.createPhysicalgoodsRequest(first,saved.id,{messageCode:'ME_INTERESA'});assert.notEqual(another.id,a.id);
  await resolveRequest(saved.id,b.id);await resolveRequest(saved.id,another.id,'RECHAZAR');
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).status,'RESERVADO');assert.equal((await transactionRows(saved.id)).rows.length,1);
});

test('competing acceptances and double submission cannot create two active transactions',async()=>{
  const {saved,a,b}=await requestedPair();
  const results=await Promise.allSettled([resolveRequest(saved.id,a.id),resolveRequest(saved.id,b.id)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  const failure=results.find(row=>row.status==='rejected') as PromiseRejectedResult;assert.equal(failure.reason.status,409);
  assert.equal((await transactionRows(saved.id)).rows.length,1);
  const states=(await db.query('select estado_solicitud from solicitud_recurso where publicacion_id=$1',[saved.id])).rows.map(row=>row.estado_solicitud).sort();assert.deepEqual(states,['ACEPTADA','PENDIENTE']);
  const winner=results[0].status==='fulfilled'?a:b;await assert.rejects(resolveRequest(saved.id,winner.id),{status:409});
  // También rechaza disponibilidad inconsistente con un acuerdo activo previo.
  await db.query("update publicacion_recurso set estado_publicacion='DISPONIBLE' where id=$1",[saved.id]);
  await assert.rejects(resolveRequest(saved.id,winner.id===a.id?b.id:a.id),{status:409});
});

test('resolution checks owner, campus, current account, publication identity and exact action payload',async()=>{
  const {saved,first,a}=await requestedPair(),admin=await otherActor('ADMINISTRADOR');
  for(const actor of [first,admin])await assert.rejects(resolveRequest(saved.id,a.id,'ACEPTAR',actor),{status:403});
  for(const body of [null,[],{}, {decision:'ACEPTADA'},{decision:['ACEPTAR']},{decision:'ACEPTAR',ownerId:auth.userId},{decision:'ACEPTAR',status:'RESERVADO'},{decision:'RECHAZAR',campusId:campus}]){
    await assert.rejects(requestsService.resolvePhysicalgoodsRequest(auth,saved.id,a.id,body),{status:400});
  }
  await assert.rejects(resolveRequest(saved.id,randomUUID()),{status:404});
  const other=await create(auth,input());await assert.rejects(resolveRequest(other.id,a.id),{status:404});
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[auth.userId]);await assert.rejects(resolveRequest(saved.id,a.id),{status:403});
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',campus_id=$2 where id=$1",[auth.userId,otherCampus]);await assert.rejects(resolveRequest(saved.id,a.id),{status:409});
  await db.query('update perfil_usuario set campus_id=$2 where id=$1',[auth.userId,campus]);
  await db.query('update publicacion_recurso set campus_id=$2 where id=$1',[saved.id,otherCampus]);await assert.rejects(resolveRequest(saved.id,a.id),{status:404});
  await db.query("update publicacion_recurso set campus_id=$2,tipo_recurso='DIGITAL' where id=$1",[saved.id,campus]);await assert.rejects(resolveRequest(saved.id,a.id),{status:404});
  await db.query("update publicacion_recurso set tipo_recurso='FISICO',deleted_at=now() where id=$1",[saved.id]);await assert.rejects(resolveRequest(saved.id,a.id),{status:404});
});

test('transaction or audit failure rolls acceptance back; an uncertain commit is discoverable without a second reservation',async()=>{
  const {saved,a,b}=await requestedPair();
  for(const failure of ['transaction','audit']){
    failTransactionInsert=failure==='transaction';failAudit=failure==='audit';await assert.rejects(resolveRequest(saved.id,a.id),{status:503});failTransactionInsert=failAudit=false;
    assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).status,'DISPONIBLE');assert.equal((await transactionRows(saved.id)).rows.length,0);
    assert.equal((await db.query('select estado_solicitud from solicitud_recurso where id=$1',[a.id])).rows[0].estado_solicitud,'PENDIENTE');
  }
  lostCommit=true;await assert.rejects(resolveRequest(saved.id,a.id),{status:503});
  const received=await requestsService.getReceivedPhysicalgoodsRequests(auth,{});assert.equal(received.data.find(row=>row.id===a.id)?.status,'ACEPTADA');assert.ok(received.data.find(row=>row.id===a.id)?.transaction);
  await assert.rejects(resolveRequest(saved.id,a.id),{status:409});await assert.rejects(resolveRequest(saved.id,b.id),{status:409});assert.equal((await transactionRows(saved.id)).rows.length,1);
});

test('cancelled agreement releases the resource, records actor/time, keeps others pending and permits selecting another',async()=>{
  const {saved,first,second,a,b}=await requestedPair(),accepted=await resolveRequest(saved.id,a.id),id=accepted.transaction!.id;
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');
  const cancelled=(await transactionRows(saved.id)).rows[0];assert.equal(cancelled.estado_transaccion,'CANCELADA');assert.equal(cancelled.cancelada_por_id,first.userId);assert.ok(cancelled.cancelada_en);assert.equal(cancelled.completada_en,null);
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).status,'DISPONIBLE');assert.equal((await requestsService.getPhysicalgoodsRequestOptions(first,saved.id)).canRequest,true);
  assert.equal((await requestsService.getPhysicalgoodsRequestOptions(second,saved.id)).activeRequest?.status,'PENDIENTE');
  await resolveRequest(saved.id,b.id);assert.equal((await transactionRows(saved.id)).rows.length,2);
  // Repetir la cancelación de la transacción antigua no libera la nueva reserva.
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).status,'RESERVADO');
  await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR'),{status:409});
});

test('only two distinct participant confirmations finalize; remaining pending requests close without deleting or rejecting history',async()=>{
  const {saved,first,second,a,b}=await requestedPair(),third=await otherActor(),rejected=await requestsService.createPhysicalgoodsRequest(third,saved.id,{messageCode:'ME_INTERESA'});
  await resolveRequest(saved.id,rejected.id,'RECHAZAR');const accepted=await resolveRequest(saved.id,a.id),id=accepted.transaction!.id;
  for(let i=0;i<2;i++)assert.equal((await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR')).status,'PENDIENTE_CONFIRMACION');
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).status,'RESERVADO');assert.equal((await requestsService.getPhysicalgoodsRequestOptions(second,saved.id)).activeRequest?.id,b.id);
  assert.equal((await db.query('select id from confirmacion_transaccion where transaccion_id=$1',[id])).rows.length,1);
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');
  assert.equal((await imagesService.getPhysicalgoodsGallery(auth,saved.id)).status,'FINALIZADO');const transaction=(await transactionRows(saved.id)).rows[0];assert.equal(transaction.estado_transaccion,'COMPLETADA');assert.ok(transaction.completada_en);
  const requests=(await db.query('select id,estado_solicitud,codigo_mensaje,solicitada_en from solicitud_recurso where publicacion_id=$1',[saved.id])).rows;
  assert.equal(requests.length,3);assert.equal(requests.find(row=>row.id===a.id)?.estado_solicitud,'ACEPTADA');assert.equal(requests.find(row=>row.id===b.id)?.estado_solicitud,'CANCELADA');assert.equal(requests.find(row=>row.id===rejected.id)?.estado_solicitud,'RECHAZADA');
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');assert.equal((await db.query('select id from confirmacion_transaccion where transaccion_id=$1',[id])).rows.length,2);
  await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CANCELAR'),{status:409});await assert.rejects(resolveRequest(saved.id,b.id),{status:409});
});

test('agreement terms survive later edits and donation acceptance stores no amount',async()=>{
  const {saved,a}=await requestedPair(),accepted=await resolveRequest(saved.id,a.id),before=(await transactionRows(saved.id)).rows[0];
  const detail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);await editService.updatePhysicalgoods(auth,saved.id,updates(detail,{modality:'DONACION',price:null,title:'Otro nombre'}));
  assert.deepEqual((await transactionRows(saved.id)).rows[0],before);assert.equal(accepted.transaction?.amount,15000);
  const donation=await create(auth,input({modality:'DONACION',price:null})),requester=await otherActor(),request=await requestsService.createPhysicalgoodsRequest(requester,donation.id,{messageCode:'ME_INTERESA'});
  assert.equal((await resolveRequest(donation.id,request.id)).transaction?.amount,null);
});

test('participant transitions are private, atomic on audit failure and do not reactivate withdrawn resources',async()=>{
  const {saved,first,second,a,b}=await requestedPair(),accepted=await resolveRequest(saved.id,a.id),id=accepted.transaction!.id;
  await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(second,saved.id,id,{},'CANCELAR'),{status:404});
  await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{status:'COMPLETADA'},'CONFIRMAR'),{status:400});
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');failAudit=true;
  await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR'),{status:503});failAudit=false;
  assert.equal((await transactionRows(saved.id)).rows[0].estado_transaccion,'PENDIENTE_CONFIRMACION');assert.equal((await db.query('select id from confirmacion_transaccion where transaccion_id=$1',[id])).rows.length,1);
  assert.equal((await db.query('select estado_solicitud from solicitud_recurso where id=$1',[b.id])).rows[0].estado_solicitud,'PENDIENTE');
  const detail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);await editService.withdrawPhysicalgoods(auth,saved.id,{updatedAt:detail.updatedAt});
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');
  assert.ok((await db.query('select deleted_at from publicacion_recurso where id=$1',[saved.id])).rows[0].deleted_at);
  await assert.rejects(imagesService.getPhysicalgoodsGallery(auth,saved.id),{status:404});
  const own=await requestsService.getReceivedPhysicalgoodsRequests(auth,{});assert.equal(own.data.length,2);assert.equal(own.data[0].publication.canView,false);assert.equal(own.data[0].transaction?.id,id);
});

test('received requests are own historical paginated projections even with inactive catalogue messages',async()=>{
  const {saved,first,a}=await requestedPair();await db.query("update mensaje_solicitud set activo=false where codigo='ME_INTERESA'");
  try{
    const page=await requestsService.getReceivedPhysicalgoodsRequests(auth,{limit:'1'});assert.equal(page.data.length,1);assert.equal(page.meta.hasMore,true);assert.equal(page.data[0].id,a.id);
    assert.equal(page.data[0].requester.id,first.userId);assert.ok(page.data[0].message);assert.doesNotMatch(JSON.stringify(page),/email|institucion_id|foto_path|storage_path|estado_cuenta/);
    assert.equal((await requestsService.getReceivedPhysicalgoodsRequests(auth,{page:'2',limit:'1'})).data.length,1);
    assert.equal((await requestsService.getReceivedPhysicalgoodsRequests(first,{})).data.length,0);
    for(const query of [{campusId:campus},{ownerId:auth.userId},{limit:'0'},{page:['1']},{limit:'101'}])await assert.rejects(requestsService.getReceivedPhysicalgoodsRequests(auth,query),{status:400});
    await db.query('update publicacion_recurso set campus_id=$2 where id=$1',[saved.id,otherCampus]);
    const history=await requestsService.getReceivedPhysicalgoodsRequests(auth,{});assert.equal(history.data.length,2);assert.equal(history.data[0].canResolve,false);assert.equal(history.data[0].campus.id,otherCampus);
  }finally{await db.query("update mensaje_solicitud set activo=true where codigo='ME_INTERESA'");}
});

test('authenticated HTTP received, resolve and transaction endpoints validate inputs and sanitize dependency errors',async()=>{
  const {saved,first,a}=await requestedPair(),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  assert.equal((await originalFetch(base+'/received-requests')).status,401);
  let response=await originalFetch(base+'/received-requests?limit=1',{headers});assert.equal(response.status,200);assert.equal((await response.json()).meta.hasMore,true);
  failTransactionInsert=true;response=await originalFetch(base+'/'+saved.id+'/requests/'+a.id,{method:'PATCH',headers,body:JSON.stringify({decision:'ACEPTAR'})});assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/private transaction|password|SQL/);failTransactionInsert=false;
  response=await originalFetch(base+'/'+saved.id+'/requests/'+a.id,{method:'PATCH',headers,body:JSON.stringify({decision:'ACEPTAR'})});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const id=(await response.json()).data.transaction.id;
  const confirm=()=>originalFetch(base+'/'+saved.id+'/transactions/'+id+'/confirm',{method:'POST',headers,body:'{}'});
  assert.equal((await confirm()).status,200);current=structuredClone(first);response=await confirm();assert.equal(response.status,200);assert.equal((await response.json()).data.status,'COMPLETADA');
});

test('sent list exposes only the requester rows and lets a pending requester reopen a resource reserved for somebody else',async()=>{
  const {saved,first,second,a,b}=await requestedPair();await resolveRequest(saved.id,a.id);
  const own=await requestsService.getSentPhysicalgoodsRequests(second,{});assert.equal(own.data.length,1);assert.equal(own.data[0].id,b.id);assert.equal(own.data[0].status,'PENDIENTE');assert.equal(own.data[0].publication.status,'RESERVADO');assert.equal(own.data[0].transaction,null);
  assert.equal((await imagesService.getPhysicalgoodsGallery(second,own.data[0].publication.id)).status,'RESERVADO');
  assert.equal((await requestsService.getSentPhysicalgoodsRequests(first,{})).data[0].status,'ACEPTADA');assert.equal((await requestsService.getSentPhysicalgoodsRequests(auth,{})).data.length,0);
  current=structuredClone(second);const response=await originalFetch(base+'/sent-requests',{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.length,1);assert.equal(body.data[0].id,b.id);assert.doesNotMatch(JSON.stringify(body),new RegExp(a.id));
  for(const query of [{requesterId:first.userId},{campusId:campus},{page:'0'}])await assert.rejects(requestsService.getSentPhysicalgoodsRequests(second,query),{status:400});
  await db.query('update publicacion_recurso set campus_id=$2 where id=$1',[saved.id,otherCampus]);
  const history=await requestsService.getSentPhysicalgoodsRequests(second,{});assert.equal(history.data.length,1);assert.equal(history.data[0].publication.canView,false);
});

test('competing completion and cancellation serialize and cannot leave a finalized publication with a live request',async()=>{
  const {saved,first,second,a}=await requestedPair(),accepted=await resolveRequest(saved.id,a.id),id=accepted.transaction!.id;
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR');
  const results=await Promise.allSettled([
    transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR'),
    transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CANCELAR')]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal((results.find(row=>row.status==='rejected') as PromiseRejectedResult).reason.status,409);
  const status=(await transactionRows(saved.id)).rows[0].estado_transaccion;
  const detail=await imagesService.getPhysicalgoodsGallery(auth,saved.id);assert.equal(detail.status,status==='COMPLETADA'?'FINALIZADO':'DISPONIBLE');
  const pending=(await requestsService.getPhysicalgoodsRequestOptions(second,saved.id)).activeRequest;assert.equal(pending?.status,status==='COMPLETADA'?undefined:'PENDIENTE');
});

async function acceptedAgreement() {
  const pair=await requestedPair(),accepted=await resolveRequest(pair.saved.id,pair.a.id);
  return {...pair,id:accepted.transaction!.id};
}
const location={buildingId:'ebuilding',floorId:'ebuilding_floor2'};

test('agreement detail exposes agreed terms, participants and precise confirmation dates independently of current publication edits',async()=>{
  const {saved,first,id}=await acceptedAgreement();
  let detail=await transactionsService.getPhysicalgoodsTransaction(auth,saved.id,id);
  assert.equal(detail.role,'PROPIETARIO');assert.equal(detail.owner.id,auth.userId);assert.equal(detail.receiver.id,first.userId);assert.equal(detail.campus.id,campus);
  assert.equal(detail.status,'RESERVADA');assert.equal(detail.modality,'VENTA');assert.equal(detail.amount,15000);assert.equal(detail.currency,'CLP');assert.equal(detail.confirmations.length,0);assert.equal(detail.canConfirm,true);assert.equal(detail.canCancel,true);assert.match(detail.startedAt,/\.\d{6}Z$/);
  const gallery=await imagesService.getPhysicalgoodsGallery(auth,saved.id);await editService.updatePhysicalgoods(auth,saved.id,updates(gallery,{modality:'DONACION',price:null}));
  detail=await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id);assert.equal(detail.role,'RECEPTOR');assert.equal(detail.modality,'VENTA');assert.equal(detail.amount,15000);
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');
  detail=await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id);assert.equal(detail.status,'PENDIENTE_CONFIRMACION');assert.equal(detail.canConfirm,false);assert.equal(detail.canCancel,true);assert.equal(detail.confirmations[0].userId,first.userId);assert.equal(detail.confirmations[0].role,'RECEPTOR');assert.match(detail.confirmations[0].confirmedAt,/\.\d{6}Z$/);
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR');detail=await transactionsService.getPhysicalgoodsTransaction(auth,saved.id,id);
  assert.equal(detail.status,'COMPLETADA');assert.equal(detail.canConfirm,false);assert.equal(detail.canCancel,false);assert.ok(detail.completedAt);assert.equal(detail.cancelledAt,null);
  assert.doesNotMatch(JSON.stringify(detail),/email|foto_path|estado_cuenta|detalle_cancelacion|storage_path|password/);
});

test('agreement consultation excludes outsiders and admins, wrong resource IDs, changed context and inactive accounts',async()=>{
  const {saved,first,second,id}=await acceptedAgreement(),admin=await otherActor('ADMINISTRADOR');
  for(const actor of [second,admin]){
    await assert.rejects(transactionsService.getPhysicalgoodsTransaction(actor,saved.id,id),{status:404});
    await assert.rejects(transactionsService.getPhysicalgoodsCoordinationOptions(actor,saved.id,id),{status:404});
    await assert.rejects(transactionsService.getPhysicalgoodsCoordinationMessages(actor,saved.id,id,{}),{status:404});
    await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(actor,saved.id,id,location),{status:404});
  }
  assert.equal(mapReads,0);await assert.rejects(transactionsService.getPhysicalgoodsTransaction(auth,saved.id,randomUUID()),{status:404});
  const unrelated=await create(auth,input());await assert.rejects(transactionsService.getPhysicalgoodsTransaction(auth,unrelated.id,id),{status:404});
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[first.userId]);await assert.rejects(transactionsService.getPhysicalgoodsTransaction(first,saved.id,id),{status:403});
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',campus_id=$2 where id=$1",[first.userId,otherCampus]);await assert.rejects(transactionsService.getPhysicalgoodsTransaction(first,saved.id,id),{status:409});
  const foreign={...first,campusId:otherCampus,profile:{...first.profile,campus_id:otherCampus}};
  const historical=await transactionsService.getPhysicalgoodsTransaction(foreign,saved.id,id);assert.equal(historical.canConfirm,false);assert.equal(historical.canCancel,false);
  await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(foreign,saved.id,id,{},'CONFIRMAR'),{status:404});
});

test('participants can still reach and close the agreement from own lists after publication withdrawal',async()=>{
  const {saved,first,second,id}=await acceptedAgreement();
  const gallery=await imagesService.getPhysicalgoodsGallery(auth,saved.id);await editService.withdrawPhysicalgoods(auth,saved.id,{updatedAt:gallery.updatedAt});
  for(const participant of [auth,first]){
    const detail=await transactionsService.getPhysicalgoodsTransaction(participant,saved.id,id);assert.equal(detail.publication.isWithdrawn,true);assert.equal(detail.canCancel,true);
  }
  const received=await requestsService.getReceivedPhysicalgoodsRequests(auth,{}),sent=await requestsService.getSentPhysicalgoodsRequests(first,{});
  assert.equal(received.data.length,2);assert.equal(sent.data.length,1);assert.equal(sent.data[0].transaction?.id,id);assert.equal(sent.data[0].publication.canView,false);
  const pendingHistory=await requestsService.getSentPhysicalgoodsRequests(second,{});assert.equal(pendingHistory.data.length,1);assert.equal(pendingHistory.data[0].transaction,null);
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');const cancelled=await transactionsService.getPhysicalgoodsTransaction(auth,saved.id,id);
  assert.equal(cancelled.status,'CANCELADA');assert.equal(cancelled.cancelledById,first.userId);assert.match(cancelled.cancelledAt!,/\.\d{6}Z$/);assert.equal(cancelled.publication.isWithdrawn,true);
  await assert.rejects(imagesService.getPhysicalgoodsGallery(first,saved.id),{status:404});
});

test('coordination loads visible active-campus building and floor names and never mesh identifiers or foreign maps',async()=>{
  const {saved,id}=await acceptedAgreement();
  const options=await transactionsService.getPhysicalgoodsCoordinationOptions(auth,saved.id,id);assert.equal(options.buildings.length,2);assert.deepEqual(options.buildings[1],{id:'cabin01',name:'Cabaña C',floors:[{id:'cabin01_floor1',name:'Piso -3'}]});
  assert.doesNotMatch(JSON.stringify(options),/pois|meshName|transform|campusId/);
  activeMap!.buildings.push({id:'hidden',name:'Hidden',isVisible:false,floors:[{id:'hidden_floor',name:'Hidden'}]},{id:'retired',name:'Retired',deletedAt:new Date(),floors:[]});
  (activeMap!.buildings[0] as any).floors.push({id:'hidden_floor',name:'Hidden',isVisible:false},{id:'retired_floor',name:'Retired',deletedAt:new Date()});
  assert.equal((await transactionsService.getPhysicalgoodsCoordinationOptions(auth,saved.id,id)).buildings.length,2);
  await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,{buildingId:'ebuilding',floorId:'hidden_floor'}),{status:400});
  activeMap={...activeMap!,campusId:otherCampus};await assert.rejects(transactionsService.getPhysicalgoodsCoordinationOptions(auth,saved.id,id),{status:503});
});

test('predefined coordination persists in existing notifications with server recipient, sender, text and timestamp; both participants read it',async()=>{
  const {saved,first,second,id}=await acceptedAgreement();
  const columns=()=>db.query("select column_name from information_schema.columns where table_name='notificacion' order by ordinal_position");const before=await columns();
  const message=await transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location);
  assert.equal(message.senderId,auth.userId);assert.equal(message.recipientId,first.userId);assert.equal(message.text,'Estoy en Edificio E, en Piso 2.');assert.match(message.createdAt,/\.\d{6}Z$/);
  const stored=(await db.query('select * from notificacion where id=$1',[message.id])).rows[0];assert.equal(stored.transaccion_id,id);assert.equal(stored.publicacion_id,saved.id);assert.equal(stored.destinatario_id,first.userId);assert.equal(stored.tipo_notificacion,'COORDINACION_RECURSO');assert.equal(stored.actividad_id,null);assert.equal(stored.deleted_at,null);
  const response=await transactionsService.sendPhysicalgoodsCoordination(first,saved.id,id,{buildingId:'cabin01',floorId:'cabin01_floor1'});assert.equal(response.recipientId,auth.userId);assert.equal(response.senderId,first.userId);
  const page=await transactionsService.getPhysicalgoodsCoordinationMessages(first,saved.id,id,{limit:'1'});assert.equal(page.data[0].id,response.id);assert.equal(page.meta.hasMore,true);
  const older=await transactionsService.getPhysicalgoodsCoordinationMessages(auth,saved.id,id,{page:'2',limit:'1'});assert.deepEqual(older.data,[message]);assert.equal(older.meta.hasMore,false);
  assert.doesNotMatch(JSON.stringify(page),/tipo_notificacion|actividad_id|campus_id|leida_en|email/);
  await assert.rejects(transactionsService.getPhysicalgoodsCoordinationMessages(second,saved.id,id,{}),{status:404});
  (activeMap!.buildings[0] as any).name='Edificio renombrado';(activeMap!.buildings[0] as any).floors[1].name='Piso renombrado';
  assert.equal((await transactionsService.getPhysicalgoodsCoordinationMessages(first,saved.id,id,{})).data.find(row=>row.id===message.id)?.text,message.text);assert.deepEqual((await columns()).rows,before.rows);
});

test('coordination rejects free text, identity overrides, malformed fields and floors that do not belong to the selected building',async()=>{
  const {saved,id}=await acceptedAgreement();
  for(const body of [null,[],{}, {buildingId:['ebuilding'],floorId:'ebuilding_floor2'}, {buildingId:'../foreign',floorId:'x'},
    {buildingId:'ebuilding',floorId:'cabin01_floor1'}, {buildingId:'missing',floorId:'missing'},
    ...['text','message','senderId','recipientId','transactionId','campusId','createdAt','messageCode'].map(key=>({...location,[key]:'override'}))]){
    await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,body),{status:400});
  }
  for(const query of [{senderId:auth.userId},{limit:'0'},{page:['1']},{limit:'101'}])await assert.rejects(transactionsService.getPhysicalgoodsCoordinationMessages(auth,saved.id,id,query),{status:400});
  assert.equal((await db.query('select id from notificacion where transaccion_id=$1',[id])).rows.length,0);
});

test('Mongo absence or outage affects only coordination and never prevents participant confirmation/cancellation',async()=>{
  const {saved,first,id}=await acceptedAgreement();activeMap=null;
  assert.deepEqual(await transactionsService.getPhysicalgoodsCoordinationOptions(auth,saved.id,id),{buildings:[]});
  await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location),{status:400});
  failMap=true;await assert.rejects(transactionsService.getPhysicalgoodsCoordinationOptions(auth,saved.id,id),{status:503});await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location),{status:503});
  assert.equal((await transactionsService.getPhysicalgoodsTransaction(auth,saved.id,id)).canConfirm,true);
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR');await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');
  assert.equal((await transactionsService.getPhysicalgoodsTransaction(auth,saved.id,id)).status,'CANCELADA');assert.deepEqual(await transactionsService.getPhysicalgoodsCoordinationOptions(auth,saved.id,id),{buildings:[]});
});

test('closing the agreement or changing the actor while Mongo is read prevents a late coordination write',async()=>{
  const {saved,first,id}=await acceptedAgreement();
  onMapRead=()=>transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR').then(()=>{});
  await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location),{status:409});assert.equal((await db.query('select id from notificacion where transaccion_id=$1',[id])).rows.length,0);
  const next=await acceptedAgreement();onMapRead=()=>db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[auth.userId]).then(()=>{});
  await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,next.saved.id,next.id,location),{status:403});assert.equal((await db.query('select id from notificacion where transaccion_id=$1',[next.id])).rows.length,0);
});

test('coordination insertion failure is atomic and a lost insertion acknowledgement is recovered from the message history',async()=>{
  const {saved,first,id}=await acceptedAgreement(),before=await transactionRows(saved.id);failCoordination=true;
  await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location),{status:503});failCoordination=false;
  assert.deepEqual((await transactionRows(saved.id)).rows,before.rows);assert.equal((await db.query('select id from notificacion where transaccion_id=$1',[id])).rows.length,0);
  lostCoordinationCommit=true;await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location),{status:503});
  const history=await transactionsService.getPhysicalgoodsCoordinationMessages(first,saved.id,id,{});assert.equal(history.data.length,1);assert.equal(history.data[0].text,'Estoy en Edificio E, en Piso 2.');
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');
  await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location),{status:409});assert.equal((await transactionsService.getPhysicalgoodsCoordinationMessages(auth,saved.id,id,{})).data.length,1);
});

test('HTTP agreement and coordination routes keep authenticated private envelopes and safe dependency failures',async()=>{
  const {saved,first,id}=await acceptedAgreement(),url=base+'/'+saved.id+'/transactions/'+id,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  assert.equal((await originalFetch(url)).status,401);let response=await originalFetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).data.amount,15000);
  response=await originalFetch(url+'/coordination-options',{headers});assert.equal(response.status,200);assert.equal((await response.json()).data.buildings.length,2);
  failMap=true;response=await originalFetch(url+'/coordination-options',{headers});assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/Mongo URI|password/);failMap=false;
  response=await originalFetch(url+'/messages',{method:'POST',headers,body:JSON.stringify(location)});assert.equal(response.status,201);const receipt=(await response.json()).data;assert.equal(receipt.recipientId,first.userId);
  current=structuredClone(first);response=await originalFetch(url+'/messages?limit=1',{headers});assert.equal(response.status,200);assert.equal((await response.json()).data[0].id,receipt.id);
  response=await originalFetch(url+'/cancel',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);response=await originalFetch(url,{headers});assert.equal((await response.json()).data.status,'CANCELADA');
});

test('own publication history preserves every state and origin after profile campus change without exposing other owners',async()=>{
  const saved=await create(auth,input()),other=await otherActor();await create(other,input());
  const columnInventory=()=>db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' order by table_name,ordinal_position");
  const before=await columnInventory();
  for(const status of ['DISPONIBLE','RESERVADO','FINALIZADO','OCULTO','CANCELADO']){
    await db.query('update publicacion_recurso set estado_publicacion=$2 where id=$1',[saved.id,status]);
    const history=await historyService.getOwnPhysicalgoods(auth,{});assert.equal(history.data.length,1);assert.equal(history.data[0].status,status);
  }
  await db.query('update publicacion_recurso set deleted_at=now() where id=$1',[saved.id]);
  await db.query('update perfil_usuario set campus_id=$2 where id=$1',[auth.userId,otherCampus]);
  const moved={...auth,campusId:otherCampus,profile:{...auth.profile,campus_id:otherCampus}};
  const history=await historyService.getOwnPhysicalgoods(moved,{}),detail=await historyService.getOwnPhysicalgoodsDetail(moved,saved.id);
  assert.equal(history.data[0].campus.id,campus);assert.equal(history.data[0].isWithdrawn,true);assert.equal(history.data[0].canView,false);
  assert.equal(detail.description,'Funciona correctamente');assert.equal(detail.images.length,1);assert.equal(detail.campus.id,campus);
  assert.doesNotMatch(JSON.stringify(detail),/storage_path|bucket_id|email|foto_path|institucion_id/);
  assert.deepEqual((await columnInventory()).rows,before.rows);
  await assert.rejects(imagesService.getPhysicalgoodsGallery(moved,saved.id),{status:404});
  for(const actor of [other,await otherActor('ADMINISTRADOR')])await assert.rejects(historyService.getOwnPhysicalgoodsDetail(actor,saved.id),{status:404});
});

test('own publication history paginates before media signing and rejects arbitrary scope or invalid IDs',async()=>{
  const first=await create(auth,input()),second=await create(auth,input({title:'Segundo recurso'}));
  signed=[];signedPaths=[];failSign=true;
  const page=await historyService.getOwnPhysicalgoods(auth,{limit:'1'}),next=await historyService.getOwnPhysicalgoods(auth,{page:'2',limit:'1'});
  assert.equal(page.data[0].id,second.id);assert.equal(page.meta.hasMore,true);assert.equal(next.data[0].id,first.id);assert.equal(next.meta.hasMore,false);
  assert.equal(signed.length,0);assert.equal(signedPaths.length,0);
  for(const query of [{campusId:campus},{ownerId:auth.userId},{page:'0'},{limit:'101'}])await assert.rejects(historyService.getOwnPhysicalgoods(auth,query),{status:400});
  await assert.rejects(historyService.getOwnPhysicalgoodsDetail(auth,'bad'),{status:400});
  await assert.rejects(historyService.getOwnPhysicalgoodsDetail(auth,first.id),{status:503});failSign=false;
  await db.query("update archivo_publicacion set storage_path=$2 where publicacion_id=$1",[first.id,otherCampus+'/foreign.png']);
  await assert.rejects(historyService.getOwnPhysicalgoodsDetail(auth,first.id),{status:503});assert.equal(signed.length,1);
});

test('rejected and closed requests remain visible and have private details after withdrawal and campus movement',async()=>{
  const {saved,first,second,a,b}=await requestedPair();await resolveRequest(saved.id,a.id,'RECHAZAR');await resolveRequest(saved.id,b.id);
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,(await transactionRows(saved.id)).rows[0].id as string,{},'CANCELAR');
  await db.query('update publicacion_recurso set deleted_at=now() where id=$1',[saved.id]);
  for(const actor of [auth,first,second]){
    await db.query('update perfil_usuario set campus_id=$2 where id=$1',[actor.userId,otherCampus]);
    const moved={...actor,campusId:otherCampus,profile:{...actor.profile,campus_id:otherCampus}};
    const list=actor.userId===auth.userId?await requestsService.getReceivedPhysicalgoodsRequests(moved,{}):await requestsService.getSentPhysicalgoodsRequests(moved,{});
    assert.equal(list.data.length,actor.userId===auth.userId?2:1);assert.ok(list.data.every(row=>!row.canResolve&&!row.publication.canView&&row.publication.isWithdrawn&&row.campus.id===campus));
    const ownId=actor.userId===second.userId?b.id:a.id,detail=await requestsService.getOwnPhysicalgoodsRequest(moved,saved.id,ownId);
    assert.equal(detail.status,actor.userId===second.userId?'CANCELADA':'RECHAZADA');assert.ok(detail.message);assert.match(detail.requestedAt,/\.\d{6}Z$/);
  }
  const outsider=await otherActor('ADMINISTRADOR');
  await assert.rejects(requestsService.getOwnPhysicalgoodsRequest(outsider,saved.id,a.id),{status:404});
  const movedFirst={...first,campusId:otherCampus,profile:{...first.profile,campus_id:otherCampus}};
  await assert.rejects(requestsService.getOwnPhysicalgoodsRequest(movedFirst,saved.id,b.id),{status:404});
  await assert.rejects(requestsService.getOwnPhysicalgoodsRequest(movedFirst,randomUUID(),a.id),{status:404});
  await assert.rejects(requestsService.resolvePhysicalgoodsRequest({...auth,campusId:otherCampus,profile:{...auth.profile,campus_id:otherCampus}},saved.id,a.id,{decision:'RECHAZAR'}),{status:404});
});

test('transaction history retains cancelled and completed agreements with original terms and excludes other participants',async()=>{
  const {saved,first,second,a,b}=await requestedPair(),cancelled=(await resolveRequest(saved.id,a.id)).transaction!.id;
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,cancelled,{},'CANCELAR');
  const completed=(await resolveRequest(saved.id,b.id)).transaction!.id;
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,completed,{},'CONFIRMAR');
  await transactionsService.transitionPhysicalgoodsTransaction(second,saved.id,completed,{},'CONFIRMAR');
  await db.query("update publicacion_recurso set modalidad='DONACION',precio=null,deleted_at=now() where id=$1",[saved.id]);
  const page=await transactionsService.getOwnPhysicalgoodsTransactions(auth,{limit:'1'}),next=await transactionsService.getOwnPhysicalgoodsTransactions(auth,{page:'2',limit:'1'});
  assert.equal(page.data[0].id,completed);assert.equal(page.data[0].status,'COMPLETADA');assert.equal(page.data[0].amount,15000);assert.equal(page.meta.hasMore,true);
  assert.equal(next.data[0].id,cancelled);assert.equal(next.data[0].status,'CANCELADA');assert.equal(next.meta.hasMore,false);
  assert.deepEqual((await transactionsService.getOwnPhysicalgoodsTransactions(first,{})).data.map(row=>row.id),[cancelled]);
  assert.deepEqual((await transactionsService.getOwnPhysicalgoodsTransactions(second,{})).data.map(row=>row.id),[completed]);
  assert.equal((await transactionsService.getOwnPhysicalgoodsTransactions(await otherActor('ADMINISTRADOR'),{})).data.length,0);
  assert.doesNotMatch(JSON.stringify(page),/solicitud_id|email|storage_path|institucion_id/);
  for(const query of [{participantId:auth.userId},{campusId:campus},{limit:'0'}])await assert.rejects(transactionsService.getOwnPhysicalgoodsTransactions(auth,query),{status:400});
});

test('former-campus participants can read their agreement and coordination history but cannot interact with that campus',async()=>{
  const {saved,first,id}=await acceptedAgreement();await transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location);
  for(const actor of [auth,first]){
    await db.query('update perfil_usuario set campus_id=$2 where id=$1',[actor.userId,otherCampus]);
    const moved={...actor,campusId:otherCampus,profile:{...actor.profile,campus_id:otherCampus}};
    const history=await transactionsService.getOwnPhysicalgoodsTransactions(moved,{}),detail=await transactionsService.getPhysicalgoodsTransaction(moved,saved.id,id);
    assert.equal(history.data.length,1);assert.equal(detail.campus.id,campus);assert.equal(detail.canConfirm,false);assert.equal(detail.canCancel,false);
    assert.equal((await transactionsService.getPhysicalgoodsCoordinationMessages(moved,saved.id,id,{})).data.length,1);
    for(const action of ['CONFIRMAR','CANCELAR'] as const)await assert.rejects(transactionsService.transitionPhysicalgoodsTransaction(moved,saved.id,id,{},action),{status:404});
    await assert.rejects(transactionsService.sendPhysicalgoodsCoordination(moved,saved.id,id,location),{status:404});
    await assert.rejects(imagesService.getPhysicalgoodsGallery(moved,saved.id),{status:404});
    await assert.rejects(requestsService.createPhysicalgoodsRequest(moved,saved.id,{messageCode:'ME_INTERESA'}),{status:404});
  }
  assert.equal((await db.query('select campus_id from publicacion_recurso where id=$1',[saved.id])).rows[0].campus_id,campus);
});

test('history revalidates persisted suspension, changed context and revoked general access before reads',async()=>{
  const saved=await create(auth,input());
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[auth.userId]);
  for(const read of [()=>historyService.getOwnPhysicalgoods(auth,{}),()=>historyService.getOwnPhysicalgoodsDetail(auth,saved.id),
    ()=>requestsService.getReceivedPhysicalgoodsRequests(auth,{}),()=>requestsService.getSentPhysicalgoodsRequests(auth,{}),()=>transactionsService.getOwnPhysicalgoodsTransactions(auth,{})])await assert.rejects(read(),{status:403});
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',campus_id=$2 where id=$1",[auth.userId,otherCampus]);
  await assert.rejects(historyService.getOwnPhysicalgoods(auth,{}),{status:409});
  await db.query("update perfil_usuario set campus_id=$2,verificado_en=null where id=$1",[auth.userId,campus]);
  await assert.rejects(historyService.getOwnPhysicalgoods({...auth,roles:[{id:randomUUID(),name:'USUARIO_AUTORIZADO',campusId:campus}]},{}),{status:403});
});

test('history HTTP routes require authentication, preserve no-store and hide unrelated UUIDs and private dependency errors',async()=>{
  const {saved,first,a,id}=await acceptedAgreement(),headers={Authorization:'Bearer '+token};
  for(const suffix of ['/my-publications','/transactions','/'+saved.id+'/history','/'+saved.id+'/requests/'+a.id])assert.equal((await originalFetch(base+suffix)).status,401);
  for(const suffix of ['/my-publications','/transactions','/'+saved.id+'/history','/'+saved.id+'/requests/'+a.id]){
    const response=await originalFetch(base+suffix,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok((await response.json()).data);
  }
  for(const suffix of ['/my-publications?campusId='+otherCampus,'/transactions?ownerId='+auth.userId,'/bad/history','/'+saved.id+'/requests/bad'])assert.equal((await originalFetch(base+suffix,{headers})).status,400);
  current=structuredClone(first);assert.equal((await originalFetch(base+'/'+saved.id+'/history',{headers})).status,404);
  current=structuredClone(await otherActor('ADMINISTRADOR'));
  for(const suffix of ['/'+saved.id+'/requests/'+a.id,'/'+saved.id+'/transactions/'+id])assert.equal((await originalFetch(base+suffix,{headers})).status,404);
  current=structuredClone(auth);failSign=true;
  const response=await originalFetch(base+'/'+saved.id+'/history',{headers});assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/private|password|storage_path/);
});

const reminderRows=(publicationId:string)=>db.query<{id:string;destinatario_id:string;created_at:Date;deleted_at:Date|null;leida_en:Date|null;titulo:string;mensaje:string}>(
  "SELECT * FROM notificacion WHERE publicacion_id=$1 AND tipo_notificacion='PHYSICAL_PUBLICATION_CLOSE_REMINDER'",[publicationId]);
const agePublication=(id:string,days=8)=>db.query("UPDATE publicacion_recurso SET publicado_en=now()-($2::text||' days')::interval WHERE id=$1",[id,days]);

test('close reminder becomes due at exactly seven days from publication, independently of later edits and reservation',async()=>{
  const saved=await create(auth,input()),instant=Date.now(),boundary=instant-7*24*60*60*1000;
  await db.query('UPDATE publicacion_recurso SET publicado_en=$2,updated_at=now() WHERE id=$1',[saved.id,new Date(boundary+1)]);
  const clock=mock.method(Date,'now',()=>instant);
  try{
    await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,0);
    await db.query("UPDATE publicacion_recurso SET publicado_en=$2,estado_publicacion='RESERVADO',updated_at=now() WHERE id=$1",[saved.id,new Date(boundary)]);
    const before=(await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id])).rows;
    await remindersService.dispatchPhysicalgoodsReminders();const rows=(await reminderRows(saved.id)).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].destinatario_id,auth.userId);assert.equal(rows[0].titulo,saved.title);assert.ok(rows[0].created_at instanceof Date);
    assert.match(rows[0].mensaje,/siete días/);assert.deepEqual((await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id])).rows,before);
  }finally{clock.mock.restore();}
});

test('reminder excludes finalized, hidden, cancelled, withdrawn and digital resources without changing schema or agreements',async()=>{
  const inventory=()=>db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
  const before=await inventory(),saved=[];
  for(const state of ['DISPONIBLE','RESERVADO','FINALIZADO','OCULTO','CANCELADO','WITHDRAWN','DIGITAL']){
    const item=await create(auth,input({title:state}));await agePublication(item.id);saved.push({...item,state});
    if(state==='WITHDRAWN')await db.query('UPDATE publicacion_recurso SET deleted_at=now() WHERE id=$1',[item.id]);
    else if(state==='DIGITAL')await db.query("UPDATE publicacion_recurso SET tipo_recurso='DIGITAL' WHERE id=$1",[item.id]);
    else await db.query('UPDATE publicacion_recurso SET estado_publicacion=$2 WHERE id=$1',[item.id,state]);
  }
  await remindersService.dispatchPhysicalgoodsReminders();
  for(const item of saved)assert.equal((await reminderRows(item.id)).rows.length,['DISPONIBLE','RESERVADO'].includes(item.state)?1:0);
  assert.deepEqual((await inventory()).rows,before.rows);
  assert.equal((await db.query('SELECT id FROM transaccion_recurso WHERE propietario_id=$1',[auth.userId])).rows.length,0);
});

test('concurrent reminder checks, rereads, deletion and later weeks never recreate a delivered reminder',async()=>{
  const saved=await create(auth,input());await agePublication(saved.id);
  await Promise.all([remindersService.dispatchPhysicalgoodsReminders(),remindersService.dispatchPhysicalgoodsReminders()]);
  const rows=(await reminderRows(saved.id)).rows;assert.equal(rows.length,1);
  await notificationsService.ownNotificationOperation(auth,{id:rows[0].id});
  await notificationsService.ownNotificationOperation(auth,{id:rows[0].id,remove:true});
  await agePublication(saved.id,30);await remindersService.dispatchPhysicalgoodsReminders();
  const history=(await reminderRows(saved.id)).rows;assert.equal(history.length,1);assert.equal(history[0].id,rows[0].id);assert.ok(history[0].deleted_at);assert.ok(history[0].leida_en);
});

test('reminder failures roll back and uncertain committed deliveries are not duplicated on retry',async()=>{
  const saved=await create(auth,input());await agePublication(saved.id);failCoordination=true;
  assert.ok((await remindersService.dispatchPhysicalgoodsReminders()).failed>0);assert.equal((await reminderRows(saved.id)).rows.length,0);
  failCoordination=false;lostCoordinationCommit=true;
  assert.ok((await remindersService.dispatchPhysicalgoodsReminders()).failed>0);assert.equal((await reminderRows(saved.id)).rows.length,1);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,1);
});

test('reminder delivery checks active verified/current authorized owners and revalidates changes after candidate discovery',async()=>{
  const saved=await create(auth,input()),owner=await otherActor('USUARIO_AUTORIZADO'),authorized=await create(owner,input());
  await agePublication(saved.id);await agePublication(authorized.id);
  await db.query('UPDATE perfil_usuario SET verificado_en=null WHERE id=$1',[owner.userId]);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1",[auth.userId]);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,0);assert.equal((await reminderRows(authorized.id)).rows.length,1);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA' WHERE id=$1",[auth.userId]);
  onReminderCandidates=async()=>{await db.query("UPDATE publicacion_recurso SET estado_publicacion='FINALIZADO' WHERE id=$1",[saved.id]);};
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,0);
  await db.query("UPDATE publicacion_recurso SET estado_publicacion='DISPONIBLE' WHERE id=$1",[saved.id]);
  onReminderCandidates=async()=>{await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1",[auth.userId]);};
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,0);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',verificado_en=null WHERE id=$1",[auth.userId]);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,0);
});

test('reminder inbox and acknowledgements are private while original-campus ownership survives a profile move',async()=>{
  const saved=await create(auth,input());await agePublication(saved.id);await remindersService.dispatchPhysicalgoodsReminders();
  const id=(await reminderRows(saved.id)).rows[0].id,other=await otherActor('ADMINISTRADOR');
  for(const actor of [other]){
    const page=await notificationsService.ownNotificationOperation(actor,{});assert.ok('items' in page);assert.equal(page.items.some(row=>row.id===id),false);
    for(const remove of [false,true])await assert.rejects(notificationsService.ownNotificationOperation(actor,{id,remove}),{status:404});
  }
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[auth.userId,otherCampus]);
  const moved={...auth,campusId:otherCampus,profile:{...auth.profile,campus_id:otherCampus}};
  const page=await notificationsService.ownNotificationOperation(moved,{});assert.ok('items' in page);const item=page.items.find(row=>row.id===id)!;
  assert.equal(item.type,'PHYSICAL_PUBLICATION_CLOSE_REMINDER');assert.ok('publicationId' in item);assert.equal(item.publicationId,saved.id);
  assert.doesNotMatch(JSON.stringify(item),/destinatario_id|actividad_id|storage_path|email|campus_id/);
  await notificationsService.ownNotificationOperation(moved,{id});assert.ok((await reminderRows(saved.id)).rows[0].leida_en);
  const detail=await historyService.getOwnPhysicalgoodsDetail(moved,saved.id);assert.equal(detail.campus.id,campus);assert.equal(detail.canView,false);
  await assert.rejects(imagesService.getPhysicalgoodsGallery(moved,saved.id),{status:404});
  await db.query('UPDATE publicacion_recurso SET deleted_at=now() WHERE id=$1',[saved.id]);
  const retained=await notificationsService.ownNotificationOperation(moved,{});assert.ok('items' in retained);assert.ok(retained.items.some(row=>row.id===id));
});

test('fresh own-publication detail points to the current pending agreement instead of an outdated reminder-time agreement',async()=>{
  const {saved,first,a,b}=await requestedPair();await agePublication(saved.id);await remindersService.dispatchPhysicalgoodsReminders();
  assert.equal((await historyService.getOwnPhysicalgoodsDetail(auth,saved.id)).activeTransaction,null);
  const firstId=(await resolveRequest(saved.id,a.id)).transaction!.id;
  assert.equal((await historyService.getOwnPhysicalgoodsDetail(auth,saved.id)).activeTransaction?.id,firstId);
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,firstId,{},'CANCELAR');
  const secondId=(await resolveRequest(saved.id,b.id)).transaction!.id;
  assert.equal((await historyService.getOwnPhysicalgoodsDetail(auth,saved.id)).activeTransaction?.id,secondId);
  await assert.rejects(historyService.getOwnPhysicalgoodsDetail(first,saved.id),{status:404});
});

test('reminder HTTP inbox/read/delete retain no-store and never expose coordination or other owners notices',async()=>{
  const {saved,id}=await acceptedAgreement();await agePublication(saved.id);await remindersService.dispatchPhysicalgoodsReminders();
  await transactionsService.sendPhysicalgoodsCoordination(auth,saved.id,id,location);
  const notificationId=(await reminderRows(saved.id)).rows[0].id,headers={Authorization:'Bearer '+token},url=base.replace('/marketplace/physicalgoods','/users/me/notifications');
  let response=await originalFetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const items=(await response.json()).data.items;assert.equal(items.length,1);assert.equal(items[0].publicationId,saved.id);assert.equal(items[0].type,'PHYSICAL_PUBLICATION_CLOSE_REMINDER');
  assert.equal((await originalFetch(url+'/'+notificationId+'/read',{method:'PUT',headers})).status,200);
  const owner=structuredClone(current);current=structuredClone(await otherActor('ADMINISTRADOR'));
  assert.equal((await originalFetch(url+'/'+notificationId,{method:'DELETE',headers})).status,404);current=owner;
  response=await originalFetch(url+'/'+notificationId,{method:'DELETE',headers});assert.equal(response.status,200);
  assert.equal((await originalFetch(url,{headers}).then(row=>row.json())).data.items.length,0);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await reminderRows(saved.id)).rows.length,1);
});

test('reminder worker waits for in-flight work on shutdown and logs sanitized failures without affecting activity delivery',async()=>{
  const {startPhysicalgoodsReminderWorker}=await import('../src/modules/marketplace/physicalgoods/physicalgoods.reminders.worker.js');
  let release!:()=>void,signal=()=>false,calls=0;
  const stop=startPhysicalgoodsReminderWorker(async stopped=>{calls++;signal=stopped!;await new Promise<void>(resolve=>{release=resolve;});return {delivered:0,failed:0};});
  assert.equal(calls,1);assert.equal(signal(),false);const shutdown=stop();assert.equal(signal(),true);release();await shutdown;assert.equal(calls,1);
  const logs:unknown[][]=[],logger=mock.method(console,'error',(...args:unknown[])=>{logs.push(args);});
  try{
    const stopFailure=startPhysicalgoodsReminderWorker(async()=>{throw new Error('private postgres password');});await stopFailure();
    assert.equal(logs.length,1);assert.doesNotMatch(JSON.stringify(logs),/private|password|postgres/);
  }finally{logger.mock.restore();}
  assert.deepEqual(await remindersService.dispatchPhysicalgoodsReminders(()=>true),{delivered:0,failed:0});
});

async function seedReminderPublications(count:number) {
  const items=(await db.query<{id:string}>(`INSERT INTO publicacion_recurso(campus_id,propietario_id,tipo_recurso,titulo,modalidad,publicado_en)
    SELECT $1,$2,'FISICO','Material '||i,'DONACION',now()-interval '8 days' FROM generate_series(1,$3::integer) i RETURNING id`,[campus,auth.userId,count])).rows;
  await db.query("INSERT INTO recurso_fisico(publicacion_id,categoria_id,estado_uso) SELECT unnest($1::uuid[]),$2,'BUEN_ESTADO'",[items.map(row=>row.id),category]);
  return items;
}

test('mixed activity/reminder cursor pagination includes deleted cursors and keeps each campus and recipient scope',async()=>{
  await seedReminderPublications(35);await remindersService.dispatchPhysicalgoodsReminders();
  await db.query(`INSERT INTO notificacion(destinatario_id,actividad_id,tipo_notificacion,titulo,mensaje,campus_id,actividad_evento_clave)
    VALUES($1,'507f1f77bcf86cd799439011','OFFICIAL_EVENT_PUBLISHED','Evento','Nuevo evento',$2,'activity:qa:published')`,[auth.userId,campus]);
  const first=await notificationsService.ownNotificationOperation(auth,{});assert.ok('items' in first);assert.equal(first.items.length,30);assert.ok(first.nextCursor);
  await notificationsService.ownNotificationOperation(auth,{id:first.nextCursor,remove:true});
  const next=await notificationsService.ownNotificationOperation(auth,{cursor:first.nextCursor});assert.ok('items' in next);assert.equal(next.items.length,6);assert.equal(next.nextCursor,null);
  assert.equal(next.items.some(row=>first.items.some(old=>old.id===row.id)),false);
  const outsider=await otherActor(),foreignNotice=randomUUID();await db.query(`INSERT INTO notificacion(id,destinatario_id,actividad_id,tipo_notificacion,titulo,mensaje,campus_id,actividad_evento_clave)
    VALUES($1,$2,'507f1f77bcf86cd799439011','ACTIVITY_CHANGED','Ajeno','Ajeno',$3,'activity:qa:foreign')`,[foreignNotice,outsider.userId,campus]);
  const foreignCursor=await notificationsService.ownNotificationOperation(auth,{cursor:foreignNotice});assert.ok('items' in foreignCursor);assert.equal(foreignCursor.items.length,0);
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[auth.userId,otherCampus]);
  const moved=await notificationsService.ownNotificationOperation({...auth,campusId:otherCampus,profile:{...auth.profile,campus_id:otherCampus}},{});
  assert.ok('items' in moved);assert.ok(moved.items.every(row=>row.type==='PHYSICAL_PUBLICATION_CLOSE_REMINDER'));
});

test('bounded reminder batches make progress across checks without leaving older publications permanently ahead of the queue',async()=>{
  const items=await seedReminderPublications(101);
  const count=()=>db.query("SELECT id FROM notificacion WHERE destinatario_id=$1 AND tipo_notificacion='PHYSICAL_PUBLICATION_CLOSE_REMINDER'",[auth.userId]);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await count()).rows.length,100);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await count()).rows.length,items.length);
  await remindersService.dispatchPhysicalgoodsReminders();assert.equal((await count()).rows.length,items.length);
});

async function completedAgreement() {
  const pair=await acceptedAgreement();
  await transactionsService.transitionPhysicalgoodsTransaction(auth,pair.saved.id,pair.id,{},'CONFIRMAR');
  await transactionsService.transitionPhysicalgoodsTransaction(pair.first,pair.saved.id,pair.id,{},'CONFIRMAR');
  return pair;
}
const ratings=(id:string)=>db.query('SELECT * FROM public.valoracion WHERE transaccion_id=$1',[id]);

test('completed physical receiver rates the persisted owner once and the agreement exposes the immutable receipt to its participants',async()=>{
  const {saved,first,id}=await completedAgreement(),before=await transactionRows(saved.id),publication=await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id]),history=await audits(saved.id);
  assert.equal((await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id)).canRate,true);
  assert.equal((await transactionsService.getPhysicalgoodsTransaction(auth,saved.id,id)).canRate,false);
  const rating=await transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:5}),stored=(await ratings(id)).rows;
  assert.equal(rating.score,5);assert.match(rating.createdAt,/\.\d{6}Z$/);assert.equal(stored.length,1);
  assert.equal(stored[0].evaluador_id,first.userId);assert.equal(stored[0].evaluado_id,auth.userId);assert.equal(stored[0].transaccion_id,id);assert.equal(stored[0].comentario,null);
  for(const actor of [auth,first]){
    const detail=await transactionsService.getPhysicalgoodsTransaction(actor,saved.id,id);assert.deepEqual(detail.rating,rating);assert.equal(detail.canRate,false);
  }
  assert.deepEqual((await transactionRows(saved.id)).rows,before.rows);assert.deepEqual((await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id])).rows,publication.rows);assert.deepEqual(await audits(saved.id),history);
  assert.deepEqual(Object.keys(rating).sort(),['createdAt','id','score']);
});

test('rating is unavailable before double confirmation and after cancellation, and only the receiver can submit it',async()=>{
  const {saved,first,second,id}=await acceptedAgreement(),body={score:3};
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,body),{status:409});
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR');
  assert.equal((await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id)).canRate,false);
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,body),{status:409});
  await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CANCELAR');
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,body),{status:409});assert.equal((await ratings(id)).rows.length,0);
  const completed=await completedAgreement();
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(auth,completed.saved.id,completed.id,body),{status:403});
  for(const outsider of [second,await otherActor('ADMINISTRADOR')])await assert.rejects(transactionsService.ratePhysicalgoodsOwner(outsider,completed.saved.id,completed.id,body),{status:404});
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(completed.first,saved.id,completed.id,body),{status:404});
});

test('rating accepts only an integer score from one through five and rejects client identity, comments and state overrides',async()=>{
  const {saved,first,id}=await completedAgreement();
  for(const score of [0,6,-1,1.5,'5',NaN,Infinity,null,true,undefined])await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score}),{status:400});
  for(const body of [null,[],{},'5',...['ownerId','reviewerId','evaluatedId','transactionId','campusId','createdAt','comment','status'].map(key=>({score:4,[key]:'override'}))]){
    await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,body),{status:400});
  }
  assert.equal((await ratings(id)).rows.length,0);
  assert.equal((await transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:1})).score,1);
});

test('duplicate and competing rating submissions preserve the first score and schema without any edit or removal endpoint',async()=>{
  const {saved,first,id}=await completedAgreement(),inventory=()=>db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"),before=await inventory();
  const outcomes=await Promise.allSettled([transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:2}),transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:5})]);
  assert.equal(outcomes.filter(value=>value.status==='fulfilled').length,1);
  assert.ok(outcomes.some(value=>value.status==='rejected'&&value.reason.status===409));
  const original=(await ratings(id)).rows;
  for(const score of [2,5])await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score}),{status:409});
  assert.deepEqual((await ratings(id)).rows,original);assert.deepEqual((await inventory()).rows,before.rows);
  current=structuredClone(first);const url=base+'/'+saved.id+'/transactions/'+id+'/rating',headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  for(const method of ['PATCH','PUT','DELETE'])assert.equal((await originalFetch(url,{method,headers,body:JSON.stringify({score:4})})).status,404);
  assert.deepEqual((await ratings(id)).rows,original);
});

test('rating rechecks persisted suspension, revoked access and changed campus and does not grant writes through historical access',async()=>{
  const {saved,first,id}=await completedAgreement();
  await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1",[first.userId]);
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:4}),{status:403});
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',verificado_en=null WHERE id=$1",[first.userId]);
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner({...first,roles:[{id:randomUUID(),name:'USUARIO_AUTORIZADO',campusId:campus}]},saved.id,id,{score:4}),{status:403});
  await db.query('UPDATE perfil_usuario SET verificado_en=now(),campus_id=$2 WHERE id=$1',[first.userId,otherCampus]);
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:4}),{status:409});
  const moved={...first,campusId:otherCampus,profile:{...first.profile,campus_id:otherCampus}};
  const detail=await transactionsService.getPhysicalgoodsTransaction(moved,saved.id,id);assert.equal(detail.canRate,false);assert.equal(detail.rating,null);
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(moved,saved.id,id,{score:4}),{status:404});assert.equal((await ratings(id)).rows.length,0);
});

test('rating survives withdrawal, hidden publication and owner deactivation while its receiver and transaction remain the authority',async()=>{
  const {saved,first,id}=await completedAgreement();
  await db.query("UPDATE publicacion_recurso SET estado_publicacion='OCULTO',deleted_at=now() WHERE id=$1",[saved.id]);
  await db.query("UPDATE perfil_usuario SET estado_cuenta='DESACTIVADA',deleted_at=now() WHERE id=$1",[auth.userId]);
  assert.equal((await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id)).canRate,true);
  const rating=await transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:4});
  await assert.rejects(imagesService.getPhysicalgoodsGallery(first,saved.id),{status:404});
  const detail=await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id);assert.deepEqual(detail.rating,rating);assert.equal(detail.publication.isWithdrawn,true);assert.equal(detail.owner.id,auth.userId);
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[first.userId,otherCampus]);
  const historical=await transactionsService.getPhysicalgoodsTransaction({...first,campusId:otherCampus,profile:{...first.profile,campus_id:otherCampus}},saved.id,id);
  assert.deepEqual(historical.rating,rating);assert.equal(historical.canRate,false);assert.equal((await transactionRows(saved.id)).rows.length,1);
});

test('donation ratings use the same completed-receiver rule and do not introduce a purchase-only requirement',async()=>{
  const saved=await create(auth,input({modality:'DONACION',price:null})),first=await otherActor(),request=await requestsService.createPhysicalgoodsRequest(first,saved.id,{messageCode:'ME_INTERESA'});
  const id=(await resolveRequest(saved.id,request.id)).transaction!.id;
  await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR');await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');
  const rating=await transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:1});assert.equal(rating.score,1);
  const detail=await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id);assert.equal(detail.modality,'DONACION');assert.equal(detail.amount,null);assert.equal(detail.rating?.score,1);
});

test('rating insertion failure rolls back and an uncertain commit is recovered through the agreement without changing the score',async()=>{
  const {saved,first,id}=await completedAgreement(),before=(await transactionRows(saved.id)).rows;failRatingInsert=true;
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:5}),{status:503});assert.equal((await ratings(id)).rows.length,0);failRatingInsert=false;
  lostRatingCommit=true;await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:5}),{status:503});
  const detail=await transactionsService.getPhysicalgoodsTransaction(first,saved.id,id);assert.equal(detail.rating?.score,5);assert.equal(detail.canRate,false);
  await assert.rejects(transactionsService.ratePhysicalgoodsOwner(first,saved.id,id,{score:2}),{status:409});assert.equal((await ratings(id)).rows.length,1);assert.deepEqual((await transactionRows(saved.id)).rows,before);
});

test('rating HTTP requires identity and valid scope, returns no-store and sanitizes database failures without an editing bypass',async()=>{
  const {saved,first,id}=await completedAgreement(),url=base+'/'+saved.id+'/transactions/'+id+'/rating',headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  assert.equal((await originalFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"score":5}'})).status,401);
  assert.equal((await originalFetch(url,{method:'POST',headers,body:'{"score":5}'})).status,403);current=structuredClone(first);
  for(const body of [{score:'3'},{score:4.1},{score:3,ownerId:auth.userId}])assert.equal((await originalFetch(url,{method:'POST',headers,body:JSON.stringify(body)})).status,400);
  assert.equal((await originalFetch(base+'/bad/transactions/'+id+'/rating',{method:'POST',headers,body:'{"score":3}'})).status,400);
  assert.equal((await originalFetch(base+'/'+randomUUID()+'/transactions/'+id+'/rating',{method:'POST',headers,body:'{"score":3}'})).status,404);
  failRatingInsert=true;let response=await originalFetch(url,{method:'POST',headers,body:'{"score":3}'});assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/private|SQL|password/);failRatingInsert=false;
  response=await originalFetch(url,{method:'POST',headers,body:'{"score":3}'});assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');const receipt=(await response.json()).data;assert.equal(receipt.score,3);
  response=await originalFetch(url,{method:'POST',headers,body:'{"score":2}'});assert.equal(response.status,409);
  response=await originalFetch(url.replace('/rating',''),{headers});assert.equal(response.status,200);assert.deepEqual((await response.json()).data.rating,receipt);
  for(const role of ['anon','authenticated']){
    await db.exec('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM valoracion'),/permission denied/);await assert.rejects(db.query('UPDATE valoracion SET puntuacion=1'),/permission denied/);}finally{await db.exec('RESET ROLE');}
  }
});

const reported=(id:string)=>db.query<Record<string,any>>('SELECT * FROM public.reporte_contenido WHERE id=$1',[id]);
const reportCount=()=>db.query<{count:number}>('SELECT count(*)::int AS count FROM public.reporte_contenido');
test('physical publication reports reuse the common table with server scope, trimmed reason, pending status and a private content snapshot',async()=>{
  const saved=await create(auth,input()),reporter=await otherActor(),before=await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id]),history=await audits(saved.id);
  const receipt=await reportsService.reportPhysicalgoods(reporter,saved.id.toUpperCase(),null,{reason:'  Información falsa  ',description:'  Descripción de lo ocurrido  '});
  const row=(await reported(receipt.id)).rows[0];
  assert.equal(row.reportante_id,reporter.userId);assert.equal(row.campus_id,campus);assert.equal(row.entidad_tipo,'PUBLICACION_FISICA');assert.equal(row.entidad_id,saved.id);
  assert.equal(row.motivo,'Información falsa');assert.equal(row.descripcion,'Descripción de lo ocurrido');assert.equal(row.estado_reporte,'PENDIENTE');
  for(const key of ['resuelto_por_id','fundamento_resolucion','medida_aplicada','resuelto_en'])assert.equal(row[key],null);
  assert.equal(row.contenido_reportado_json.publication.titulo,'Calculadora');assert.equal(row.contenido_reportado_json.publication.propietario_id,auth.userId);
  assert.equal(row.contenido_reportado_json.publication.images.length,1);assert.doesNotMatch(JSON.stringify(row.contenido_reportado_json),/storage_path|base64|token|reportante_id/);
  assert.equal(receipt.publicationId,saved.id);assert.equal(receipt.transactionId,null);assert.equal(receipt.status,'PENDIENTE');assert.equal(receipt.reportedAt,new Date(row.reportado_en).toISOString());
  assert.deepEqual(Object.keys(receipt).sort(),['campusId','id','publicationId','reportedAt','status','transactionId']);
  assert.deepEqual((await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id])).rows,before.rows);assert.deepEqual(await audits(saved.id),history);
  await db.query("UPDATE publicacion_recurso SET titulo='Editada',descripcion='Nueva',deleted_at=now(),estado_publicacion='OCULTO' WHERE id=$1",[saved.id]);
  assert.deepEqual((await reported(receipt.id)).rows[0].contenido_reportado_json,row.contenido_reportado_json);
});

test('reportable publications follow existing detail visibility for sale and donation, including own content, without requiring admin or analytics permissions',async()=>{
  for(const modality of ['VENTA','DONACION']){
    const saved=await create(auth,input({modality,price:modality==='DONACION'?null:15000}));
    for(const status of ['DISPONIBLE','RESERVADO','FINALIZADO']){
      await db.query('UPDATE publicacion_recurso SET estado_publicacion=$2 WHERE id=$1',[saved.id,status]);
      const receipt=await reportsService.reportPhysicalgoods(auth,saved.id,null,{reason:'Motivo',description:'  '});
      const row=(await reported(receipt.id)).rows[0];assert.equal(row.descripcion,null);assert.equal(row.contenido_reportado_json.publication.estado_publicacion,status);
      assert.equal(row.contenido_reportado_json.publication.modalidad,modality);
    }
  }
});

test('publication reporting cannot bypass campus, visibility, retirement or physical resource type using UUIDs',async()=>{
  const saved=await create(auth,input()),reporter=await otherActor(),before=(await reportCount()).rows[0].count;
  for(const status of ['OCULTO','CANCELADO']){
    await db.query('UPDATE publicacion_recurso SET estado_publicacion=$2 WHERE id=$1',[saved.id,status]);
    await assert.rejects(reportsService.reportPhysicalgoods(reporter,saved.id,null,{reason:'Motivo'}),{status:404});
  }
  await db.query("UPDATE publicacion_recurso SET estado_publicacion='DISPONIBLE',deleted_at=now() WHERE id=$1",[saved.id]);
  await assert.rejects(reportsService.reportPhysicalgoods(reporter,saved.id,null,{reason:'Motivo'}),{status:404});
  await db.query('UPDATE publicacion_recurso SET deleted_at=null,campus_id=$2 WHERE id=$1',[saved.id,otherCampus]);
  await assert.rejects(reportsService.reportPhysicalgoods(reporter,saved.id,null,{reason:'Motivo'}),{status:404});
  await db.query("UPDATE publicacion_recurso SET campus_id=$2,tipo_recurso='DIGITAL' WHERE id=$1",[saved.id,campus]);
  await assert.rejects(reportsService.reportPhysicalgoods(reporter,saved.id,null,{reason:'Motivo'}),{status:404});
  await assert.rejects(reportsService.reportPhysicalgoods(reporter,randomUUID(),null,{reason:'Motivo'}),{status:404});
  assert.equal((await reportCount()).rows[0].count,before);
});

test('both physical transaction participants can report any agreement state while the exchange and its public visibility stay unchanged',async()=>{
  const {saved,first,id}=await acceptedAgreement();
  await db.query("UPDATE publicacion_recurso SET precio=45000,deleted_at=now(),estado_publicacion='OCULTO' WHERE id=$1",[saved.id]);
  for(const expected of ['RESERVADA','PENDIENTE_CONFIRMACION','COMPLETADA']){
    if(expected==='PENDIENTE_CONFIRMACION')await transactionsService.transitionPhysicalgoodsTransaction(auth,saved.id,id,{},'CONFIRMAR');
    if(expected==='COMPLETADA')await transactionsService.transitionPhysicalgoodsTransaction(first,saved.id,id,{},'CONFIRMAR');
    const before=await transactionRows(saved.id),history=await audits(saved.id),requests=await db.query('SELECT * FROM solicitud_recurso WHERE publicacion_id=$1',[saved.id]);
    for(const actor of [auth,first]){
      const receipt=await reportsService.reportPhysicalgoods(actor,saved.id,id,{reason:'Comportamiento durante el intercambio'}),row=(await reported(receipt.id)).rows[0];
      assert.equal(row.entidad_tipo,'TRANSACCION');assert.equal(row.entidad_id,id);assert.equal(row.reportante_id,actor.userId);
      const snapshot=row.contenido_reportado_json;
      assert.equal(snapshot.publication.id,saved.id);assert.equal(snapshot.transaction.publicacion_id,saved.id);assert.equal(snapshot.transaction.id,id);
      assert.equal(snapshot.transaction.propietario_id,auth.userId);assert.equal(snapshot.transaction.receptor_id,first.userId);assert.equal(snapshot.transaction.estado_transaccion,expected);
      assert.equal(Number(snapshot.transaction.monto_acordado),15000);assert.equal(Number(snapshot.publication.precio),45000);
      assert.equal(snapshot.confirmations.length,expected==='COMPLETADA'?2:expected==='RESERVADA'?0:1);
    }
    assert.deepEqual((await transactionRows(saved.id)).rows,before.rows);assert.deepEqual(await audits(saved.id),history);assert.deepEqual((await db.query('SELECT * FROM solicitud_recurso WHERE publicacion_id=$1',[saved.id])).rows,requests.rows);
  }
  const cancelled=await acceptedAgreement();await transactionsService.transitionPhysicalgoodsTransaction(auth,cancelled.saved.id,cancelled.id,{},'CANCELAR');
  const receipt=await reportsService.reportPhysicalgoods(cancelled.first,cancelled.saved.id,cancelled.id,{reason:'Conducta inapropiada'});
  assert.equal((await reported(receipt.id)).rows[0].contenido_reportado_json.transaction.estado_transaccion,'CANCELADA');
});

test('a transaction report requires the exact physical publication, participant and current campus, with no administrator bypass',async()=>{
  const pair=await acceptedAgreement(),other=await create(auth,input()),before=(await reportCount()).rows[0].count;
  for(const actor of [pair.second,await otherActor('ADMINISTRADOR')])await assert.rejects(reportsService.reportPhysicalgoods(actor,pair.saved.id,pair.id,{reason:'Motivo'}),{status:404});
  await assert.rejects(reportsService.reportPhysicalgoods(pair.first,other.id,pair.id,{reason:'Motivo'}),{status:404});
  await assert.rejects(reportsService.reportPhysicalgoods(pair.first,pair.saved.id,randomUUID(),{reason:'Motivo'}),{status:404});
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[pair.first.userId,otherCampus]);
  await assert.rejects(reportsService.reportPhysicalgoods(pair.first,pair.saved.id,pair.id,{reason:'Motivo'}),{status:409});
  const moved={...pair.first,campusId:otherCampus,profile:{...pair.first.profile,campus_id:otherCampus}};
  await transactionsService.getPhysicalgoodsTransaction(moved,pair.saved.id,pair.id);
  await assert.rejects(reportsService.reportPhysicalgoods(moved,pair.saved.id,pair.id,{reason:'Motivo'}),{status:404});
  assert.equal((await reportCount()).rows[0].count,before);
});

test('physical reports revalidate persisted suspension, verification, role revocation and context before inserting',async()=>{
  const saved=await create(auth,input()),reporter=await otherActor(),before=(await reportCount()).rows[0].count;
  for(const change of ["estado_cuenta='SUSPENDIDA'","estado_cuenta='DESACTIVADA',deleted_at=now()","estado_cuenta='ACTIVA',deleted_at=null,verificado_en=null"]){
    await db.query('UPDATE perfil_usuario SET '+change+' WHERE id=$1',[reporter.userId]);
    await assert.rejects(reportsService.reportPhysicalgoods({...reporter,roles:[{id:randomUUID(),name:'USUARIO_AUTORIZADO',campusId:campus}]},saved.id,null,{reason:'Motivo'}),{status:403});
  }
  await db.query('UPDATE perfil_usuario SET verificado_en=now(),campus_id=$2 WHERE id=$1',[reporter.userId,otherCampus]);
  await assert.rejects(reportsService.reportPhysicalgoods(reporter,saved.id,null,{reason:'Motivo'}),{status:409});
  assert.equal((await reportCount()).rows[0].count,before);
});

test('report payload cannot supply identities, a rating target, state or snapshot; bounded reason and optional description reuse activity validation',async()=>{
  const saved=await create(auth,input()),before=(await reportCount()).rows[0].count;
  for(const body of [null,[],{},'text',{reason:3},{reason:' '},{reason:'x'.repeat(201)},{reason:'Motivo',description:null},{reason:'Motivo',description:'x'.repeat(2001)},
    ...['campusId','userId','entityType','entityId','ratingId','transactionId','publicationId','snapshot','reportedAt','status','resolution'].map(key=>({reason:'Motivo',[key]:'override'}))]){
    await assert.rejects(reportsService.reportPhysicalgoods(auth,saved.id,null,body),{status:400});
  }
  await assert.rejects(reportsService.reportPhysicalgoods(auth,'invalid',null,{reason:'Motivo'}),{status:400});
  await assert.rejects(reportsService.reportPhysicalgoods(auth,saved.id,'invalid',{reason:'Motivo'}),{status:400});
  assert.equal((await reportCount()).rows[0].count,before);
  const receipt=await reportsService.reportPhysicalgoods(auth,saved.id,null,{reason:'x'.repeat(200),description:'x'.repeat(2000)});assert.equal((await reported(receipt.id)).rows[0].motivo.length,200);
});

test('report insertion failure rolls back and uncertain acknowledgement never changes the reported publication or schema',async()=>{
  const saved=await create(auth,input()),before=await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id]),count=(await reportCount()).rows[0].count,
    inventory=()=>db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"),columns=await inventory();
  failReportInsert=true;await assert.rejects(reportsService.reportPhysicalgoods(auth,saved.id,null,{reason:'Motivo'}),{status:503});failReportInsert=false;
  assert.equal((await reportCount()).rows[0].count,count);
  lostReportCommit=true;await assert.rejects(reportsService.reportPhysicalgoods(auth,saved.id,null,{reason:'Motivo'}),{status:503});
  assert.equal((await reportCount()).rows[0].count,count+1);assert.deepEqual((await db.query('SELECT * FROM publicacion_recurso WHERE id=$1',[saved.id])).rows,before.rows);assert.deepEqual((await inventory()).rows,columns.rows);
});

test('report HTTP is authenticated, no-store, private and sanitized, with no client read, resolution or rating-report endpoints',async()=>{
  const pair=await acceptedAgreement(),url=base.replace('/marketplace/physicalgoods','/reports/physicalgoods')+'/'+pair.saved.id,
    headers={Authorization:'Bearer '+token,'Content-Type':'application/json'},body=JSON.stringify({reason:'Motivo',description:'Detalle'});
  assert.equal((await originalFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body})).status,401);
  for(const target of [url+'?campusId='+otherCampus,url.replace(pair.saved.id,'invalid')])assert.equal((await originalFetch(target,{method:'POST',headers,body})).status,400);
  assert.equal((await originalFetch(url,{method:'POST',headers,body:JSON.stringify({reason:'Motivo',status:'RESUELTO'})})).status,400);
  failReportInsert=true;let response=await originalFetch(url,{method:'POST',headers,body});assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(await response.json()),/private|SQL|password/);failReportInsert=false;
  response=await originalFetch(url,{method:'POST',headers,body});assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');const receipt=(await response.json()).data;
  assert.equal(receipt.status,'PENDIENTE');for(const field of ['snapshot','reason','description','userId','reportante_id'])assert.equal(field in receipt,false);
  current=structuredClone(pair.first);response=await originalFetch(url+'/transactions/'+pair.id,{method:'POST',headers,body});assert.equal(response.status,201);
  current=structuredClone(pair.second);assert.equal((await originalFetch(url+'/transactions/'+pair.id,{method:'POST',headers,body})).status,404);
  for(const target of [url,url+'/'+receipt.id,base.replace('/marketplace/physicalgoods','/reports')+'/'+receipt.id]){
    for(const method of ['GET','PATCH','DELETE'])assert.equal((await originalFetch(target,{method,headers,...(method==='GET'?{}:{body})})).status,404);
  }
  assert.equal((await originalFetch(url+'/ratings/'+randomUUID(),{method:'POST',headers,body})).status,404);
  const gallery=await imagesService.getPhysicalgoodsGallery(pair.first,pair.saved.id);assert.equal('reports' in gallery,false);assert.equal('reporter' in gallery,false);
  for(const role of ['anon','authenticated']){
    await db.exec('SET ROLE '+role);try{await assert.rejects(db.query('SELECT * FROM reporte_contenido'),/permission denied/);await assert.rejects(db.query('UPDATE reporte_contenido SET estado_reporte=\'RESUELTO\''),/permission denied/);}finally{await db.exec('RESET ROLE');}
  }
});
