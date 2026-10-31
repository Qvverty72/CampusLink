import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { ObjectId } from 'mongodb';
import type { AuditEntry, AuditSearch } from '../src/modules/users/types/access.types.js';
import type { ActivityDocument } from '../src/modules/activities/types/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/types/map.types.js';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID();
let server: Server, base: string, authUser: string, invalidAuth = false, dbFailure = false;
let closePostgres: () => Promise<void>;
let beforeTransaction: (() => Promise<void>) | null = null;
let roles: Record<string,string>, permissions: Record<string,string>;
let mongoEntries: AuditEntry[] = [], mongoDocuments: ActivityDocument[] = [], mongoReads = 0, mongoFailure = false;
let mongoMap: CampusMapDocument | null = null;
let imageSigns: string[] = [], imageFailure = false;
let participationEvents: { id: string; userId: string; type: 'JOINED' | 'LEFT'; occurredAt: string; provenance: 'LIVE' | 'LEGACY_STATE' }[] = [];
const token = 'access.test.token';
const migration = () => readFile('src/database/supabase/migrations/f2_3_05_roles_permisos.sql', 'utf8');
const route = (user?: string, at = campus) => '/users/access/campuses/' + at + '/users' + (user ? '/' + user : '');
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://access-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@access-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => {
    if (beforeTransaction) { const hook=beforeTransaction; beforeTransaction=null; await hook(); }
    return { query: (sql: string, params: unknown[] = []) => {
    if (dbFailure && !['BEGIN','ROLLBACK'].includes(sql)) throw new Error('private database password details');
    return db.query(sql, params);
  }, release: () => {} }; });
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,encrypted_password text,created_at timestamptz default now()); create function auth.uid() returns uuid language sql as $$select current_setting('test.user',true)::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;");
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion','campus','carrera','asignatura','campus_carrera','carrera_asignatura','perfil_usuario','usuario_carrera','rol','permiso','rol_permiso','usuario_rol','usuario_permiso',
    'publicacion_recurso','categoria_recurso_fisico','recurso_fisico','recurso_digital','archivo_publicacion','mensaje_solicitud','solicitud_recurso','transaccion_recurso','acceso_recurso_digital','reporte_contenido','auditoria']) {
    let sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name);
    await db.exec(sql);
  }
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_01_autenticacion.sql', 'utf8'));
  await db.exec('grant all on auditoria,rol_permiso,usuario_rol,usuario_permiso,rol,permiso to anon,authenticated');
  await db.exec(await migration());
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_05_account_profile_read.sql','utf8'));
  await db.exec('grant all on publicacion_recurso to anon,authenticated');
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_07_estado_cuenta.sql','utf8'));
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_08_auditoria.sql','utf8'));
  await db.exec(await readFile('src/database/supabase/migrations/f2_4_05_edicion_fisica.sql','utf8'));
  await db.query('insert into institucion(id,nombre) values ($1,$2)', [institution, 'Test']);
  await db.query('insert into campus(id,institucion_id,nombre) values ($1,$2,$3),($4,$2,$5)', [campus,institution,'Home',otherCampus,'Other']);
  roles = Object.fromEntries((await db.query<{id:string;nombre:string}>('select id,nombre from rol')).rows.map(row => [row.nombre,row.id]));
  permissions = Object.fromEntries((await db.query<{id:string;nombre:string}>('select id,nombre from permiso')).rows.map(row => [row.nombre,row.id]));
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://access-test.invalid');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    if (url.pathname === '/auth/v1/user') return invalidAuth ? Response.json({code:'bad_jwt'}, {status:401})
      : Response.json({id:authUser,email:'test@duocuc.cl',email_confirmed_at:'2026-10-09T12:00:00Z'});
    assert.equal(url.searchParams.get('perfil_usuario_id') ?? url.searchParams.get('id'), 'eq.' + authUser);
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json((await db.query('select * from perfil_usuario where id=$1',[authUser])).rows);
    const kind = url.pathname.endsWith('/usuario_rol') ? 'rol' : 'permiso';
    assert.equal(url.searchParams.get('revocado_en'), 'is.null');
    return Response.json((await db.query(`select link.campus_id,json_build_object('id',cat.id,'nombre',cat.nombre) as ${kind}
      from usuario_${kind} link join ${kind} cat on cat.id=link.${kind}_id where link.perfil_usuario_id=$1 and link.revocado_en is null`,[authUser])).rows);
  };
  const { createApp } = await import('../src/app.js');
  const { auditImageStorage } = await import('../src/modules/users/services/audit.images.js');
  mock.method(auditImageStorage,'sign',async (path:string) => {
    imageSigns.push(path); if(imageFailure)throw Error('private Storage service key/path/token');
    return 'https://private-preview.invalid/image-'+imageSigns.length;
  });
  const { activityAuditRepository, auditSeriesFilter, auditOccurrence } = await import('../src/modules/users/repositories/audit.activities.repository.js');
  const { compareAuditEntries } = await import('../src/modules/users/domain/audit.timeline.js');
  const matchesSearch = (row:AuditEntry,search:AuditSearch) => (!search.contentName || row.entity_name?.toLowerCase().includes(search.contentName.toLowerCase())) &&
    (!search.userName || search.users?.some(user=>row.actor_usuario_id===user.id&&Date.parse(row.created_at)>=user.createdAt));
  mock.method(activityAuditRepository,'list',async (scope,limit,offset,action,from,before,search={}) => {
    mongoReads++; if(mongoFailure)throw Error('private MongoDB secret');
    return mongoEntries.filter(row=>row.campus_id===scope.id&&(!action||row.accion===action)&&(!from||Date.parse(row.created_at)>=Date.parse(from))&&(!before||Date.parse(row.created_at)<Date.parse(before))&&matchesSearch(row,search))
      .sort(compareAuditEntries).slice(offset,offset+limit);
  });
  mock.method(activityAuditRepository,'count',async (scope,action,from,before,search={}) => {
    mongoReads++; if(mongoFailure)throw Error('private MongoDB secret');
    return mongoEntries.filter(row=>row.campus_id===scope.id&&(!action||row.accion===action)&&(!from||Date.parse(row.created_at)>=Date.parse(from))&&(!before||Date.parse(row.created_at)<Date.parse(before))&&matchesSearch(row,search)).length;
  });
  mock.method(activityAuditRepository,'find',async (scope,id) => {
    mongoReads++; if(mongoFailure)throw Error('private MongoDB secret');
    return mongoDocuments.find(row=>row.campusId===scope.id&&row._id.toHexString()===id)??null;
  });
  mock.method(activityAuditRepository,'map',async (scope) => {
    mongoReads++; if(mongoFailure)throw Error('private MongoDB secret');
    assert.equal(scope,mongoDocuments[0]?.campusId??campus);
    return mongoMap as any;
  });
  mock.method(activityAuditRepository,'participation',async (_scope,_id,limit,offset) => {
    mongoReads++; if(mongoFailure)throw Error('private MongoDB secret');
    return {events:participationEvents.slice(offset,offset+limit),summary:{joined:1,left:1,historyIncomplete:true}};
  });
  mock.method(activityAuditRepository,'occurrences',async (scope,anchor,limit,offset) => {
    mongoReads++;if(mongoFailure)throw Error('private MongoDB secret');
    const filter=auditSeriesFilter(scope,anchor);
    const rows=filter?mongoDocuments.filter(row=>row.campusId===scope.id&&row.seriesId?.equals(anchor.seriesId!)&&row.type===anchor.type
      &&row.createdByUserId===anchor.createdByUserId&&row.createdAt.getTime()===anchor.createdAt.getTime())
      .sort((a,b)=>(a.occurrenceIndex??0)-(b.occurrenceIndex??0)||a._id.toHexString().localeCompare(b._id.toHexString())):[];
    return {total:rows.length,occurrences:rows.slice(offset,offset+limit).map(auditOccurrence)};
  });
  ({closePostgres} = await import('../src/database/supabase/postgres.js'));
  server = createApp().listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening',resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
});

const stateBody = (version: string, accountState = 'SUSPENDIDA') => ({accountState,version});
const stateRoute = (user: string, at = campus) => route(user,at) + '/state';
async function publication(user: string, type = 'FISICO', state = 'DISPONIBLE', at = campus) {
  const id=randomUUID();
  await db.query(`insert into publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo,modalidad,estado_publicacion)
    values ($1,$2,$3,$4,'Original title','DONACION',$5)`,[id,at,user,type,state]);
  return id;
}
async function acquisition(owner: string, receptor: string, mode: string) {
  const publicationId=await publication(owner,'DIGITAL'),requestId=randomUUID(),transactionId=randomUUID(),code=randomUUID();
  await db.query('insert into recurso_digital values ($1)',[publicationId]);
  await db.query("insert into archivo_publicacion(publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo) values ($1,'private','original.pdf','Original.pdf','application/pdf',1024,'RECURSO')",[publicationId]);
  await db.query("insert into mensaje_solicitud(codigo,descripcion) values ($1,'Original message')",[code]);
  await db.query("insert into solicitud_recurso(id,publicacion_id,solicitante_id,codigo_mensaje,estado_solicitud) values ($1,$2,$3,$4,'ACEPTADA')",[requestId,publicationId,receptor,code]);
  await db.query(`insert into transaccion_recurso(id,solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada,estado_transaccion,completada_en)
    values ($1,$2,$3,$4,$5,$6,'COMPLETADA',now())`,[transactionId,requestId,publicationId,owner,receptor,mode]);
  await db.query('insert into acceso_recurso_digital(transaccion_id,publicacion_id,receptor_id) values ($1,$2,$3)',[transactionId,publicationId,receptor]);
}
async function retainedHistory() {
  const snapshot: Record<string,unknown>={};
  for(const table of ['solicitud_recurso','transaccion_recurso','acceso_recurso_digital','archivo_publicacion','recurso_digital'])
    snapshot[table]=(await db.query('select * from '+table+' order by '+(table==='recurso_digital'?'publicacion_id':'id'))).rows;
  snapshot.digital=(await db.query("select * from publicacion_recurso where tipo_recurso='DIGITAL' order by id")).rows;
  snapshot.roles=(await db.query('select * from usuario_rol order by id')).rows;
  snapshot.permissions=(await db.query('select * from usuario_permiso order by id')).rows;
  return snapshot;
}

test('account state HTTP rejects missing session, non-administrator and foreign campus/target',async()=>{
  const {user}=await fixture(),current=await detail(user);
  assert.equal((await request(stateRoute(user),stateBody(current.version),'')).status,401);
  assert.equal((await request(stateRoute(user,otherCampus),stateBody(current.version))).status,403);
  const outsider=await profile(otherCampus);
  assert.equal((await request(stateRoute(outsider),stateBody(current.version))).status,404);
  assert.equal((await request(stateRoute(randomUUID()),stateBody(current.version))).status,404);
  authUser=user;assert.equal((await request(stateRoute(user),stateBody(current.version))).status,403);
});
test('suspension retains physical publications/profile and audits exact state, actor and change time',async()=>{
  const {actor,user}=await fixture(),id=await publication(user),current=await detail(user);
  const before=(await db.query('select * from publicacion_recurso where id=$1',[id])).rows;
  const response=await request(stateRoute(user),stateBody(current.version));assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');const next=(await response.json()).data;
  assert.equal(next.accountState,'SUSPENDIDA');assert.notEqual(next.version,current.version);
  assert.deepEqual((await db.query('select * from publicacion_recurso where id=$1',[id])).rows,before);
  const profileRow=(await db.query('select * from perfil_usuario where id=$1',[user])).rows[0];assert.equal(profileRow.deleted_at,null);
  const audit=(await db.query('select * from auditoria where entidad_id=$1',[user])).rows[0];
  assert.equal(audit.accion,'SUSPENDER_CUENTA');assert.equal(audit.actor_usuario_id,actor);assert.equal(audit.campus_id,campus);
  assert.equal(audit.datos_antes.estado_cuenta,'ACTIVA');assert.equal(audit.datos_despues.estado_cuenta,'SUSPENDIDA');
  assert.equal(new Date(audit.created_at).getTime(),new Date(profileRow.updated_at).getTime());
});
test('deactivation retires active physical listings including previous campuses, preserving all acquired digital data',async()=>{
  const {user}=await fixture(),receiver=await profile(),outsider=await profile();
  const active=[];
  for(const state of ['DISPONIBLE','RESERVADO','OCULTO'])active.push(await publication(user,'FISICO',state));
  active.push(await publication(user,'FISICO','DISPONIBLE',otherCampus));
  const completed=await publication(user,'FISICO','FINALIZADO'),cancelled=await publication(user,'FISICO','CANCELADO');
  const deleted=await publication(user),foreign=await publication(outsider);
  await db.query('update publicacion_recurso set deleted_at=now() where id=$1',[deleted]);
  await acquisition(user,receiver,'VENTA');await acquisition(user,receiver,'DONACION');
  const history=await retainedHistory();const before=(await db.query('select * from publicacion_recurso order by id')).rows;
  const current=await detail(user);const response=await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'));
  assert.equal(response.status,200);assert.equal((await response.json()).data.accountState,'DESACTIVADA');
  assert.deepEqual(await retainedHistory(),history);
  for(const row of (await db.query('select * from publicacion_recurso order by id')).rows){
    const original=before.find(previous=>previous.id===row.id)!;
    if(active.includes(row.id as string)){
      assert.ok(row.deleted_at);assert.deepEqual({...row,deleted_at:original.deleted_at,updated_at:original.updated_at},original);
    }else assert.deepEqual(row,original);
  }
  assert.ok([completed,cancelled,deleted,foreign].every(id=>!active.includes(id)));
  const audit=(await db.query('select * from auditoria where entidad_id=$1',[user])).rows[0];
  assert.equal(audit.accion,'DESACTIVAR_CUENTA');assert.equal(audit.datos_antes.publicacion_recurso.length,4);
  assert.ok(audit.datos_despues.publicacion_recurso.every((row:{deleted_at:unknown})=>row.deleted_at));
  assert.equal((await db.query('select deleted_at from perfil_usuario where id=$1',[user])).rows[0].deleted_at,null);
});
test('same old token cannot reach protected operations after suspension or deactivation',async()=>{
  for(const state of ['SUSPENDIDA','DESACTIVADA']){
    const {user}=await fixture(),current=await detail(user);
    assert.equal((await request(stateRoute(user),stateBody(current.version,state))).status,200);authUser=user;
    for(const path of ['/auth/me','/users/me/profile','/users/me/profile-options','/users/access/campuses','/maps/'+campus+'/active'])
      assert.equal((await request(path)).status,403);
    assert.equal((await request('/users/me/profile',{fullName:'Bypass'})).status,403);
  }
});
test('suspended account can be deactivated; repeated confirmed state creates no extra audit or retirement',async()=>{
  const {user}=await fixture();let current=await detail(user);
  let response=await request(stateRoute(user),stateBody(current.version));current=(await response.json()).data;
  response=await request(stateRoute(user),stateBody(current.version));assert.equal(response.status,200);
  assert.equal((await response.json()).data.version,current.version);
  response=await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'));assert.equal(response.status,200);current=(await response.json()).data;
  assert.equal((await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'))).status,200);
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,409);
  assert.equal((await db.query('select count(*)::int as count from auditoria where entidad_id=$1',[user])).rows[0].count,2);
});
test('stale account state, microsecond profile edit or role edit conflicts before account writes',async()=>{
  const {user}=await fixture();let current=await detail(user);
  await db.query("update perfil_usuario set updated_at=updated_at + interval '1 microsecond' where id=$1",[user]);
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,409);
  current=await detail(user);const original=current;
  await request(route(user),payload(current.version,[roles.USUARIO_AUTORIZADO],[]));
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,409);
  current=await detail(user);assert.equal((await request(stateRoute(user),stateBody(current.version))).status,200);
  assert.equal((await request(route(user),payload(current.version,[],[]))).status,409);
  assert.equal((await request(stateRoute(user),stateBody(original.version,'DESACTIVADA'))).status,409);
});
test('strict account body cannot reactivate, change identity, choose publications or assign privileges',async()=>{
  const {user}=await fixture(),current=await detail(user);
  for(const body of [null,[],{},stateBody('bad'),stateBody(current.version,'ACTIVA'),stateBody(current.version,'DELETED'),
    {...stateBody(current.version),actorId:authUser},{...stateBody(current.version),deleted_at:'now'},
    {...stateBody(current.version),roleIds:[roles.ADMINISTRADOR]},{...stateBody(current.version),campusId:otherCampus},
    {...stateBody(current.version),publicationIds:[]}])assert.equal((await request(stateRoute(user),body)).status,400);
  assert.equal((await detail(user)).version,current.version);
});
test('actor revocation, suspension and target move/deletion between middleware and transaction deny account update',async()=>{
  const {actor,user}=await fixture(),current=await detail(user);
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]).then(()=>{});
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,403);
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1',[actor]);
  beforeTransaction=()=>db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[actor]).then(()=>{});
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,403);
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1",[actor]);
  beforeTransaction=()=>db.query('update perfil_usuario set campus_id=$1 where id=$2',[otherCampus,user]).then(()=>{});
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,404);
  await db.query('update perfil_usuario set campus_id=$1,deleted_at=now() where id=$2',[campus,user]);
  assert.equal((await request(stateRoute(user),stateBody(current.version))).status,404);
  assert.equal((await db.query('select estado_cuenta from perfil_usuario where id=$1',[user])).rows[0].estado_cuenta,'ACTIVA');
});
test('audit failure rolls back account and publication retirement together, without exposing secrets',async()=>{
  const {user}=await fixture();await publication(user);const current=await detail(user);
  const before=(await db.query('select * from publicacion_recurso where propietario_id=$1 order by id',[user])).rows;
  await db.exec("create function fail_state_audit() returns trigger language plpgsql as $$begin raise exception 'private password secret'; end$$; create trigger fail_state_audit before insert on auditoria for each row execute function fail_state_audit();");
  try{
    const response=await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'));assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/private|secret|password/);assert.equal((await detail(user)).version,current.version);
    assert.deepEqual((await db.query('select * from publicacion_recurso where propietario_id=$1 order by id',[user])).rows,before);
  }finally{await db.exec('drop trigger fail_state_audit on auditoria;drop function fail_state_audit()');}
});
test('publication write failure rolls back the account state and creates no audit',async()=>{
  const {user}=await fixture();await publication(user);const current=await detail(user);
  await db.exec("create function fail_retirement() returns trigger language plpgsql as $$begin raise exception 'private publication secret'; end$$; create trigger fail_retirement before update on publicacion_recurso for each row execute function fail_retirement();");
  try{
    const response=await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'));assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),/private|secret/);assert.equal((await detail(user)).version,current.version);
    assert.equal((await db.query('select count(*)::int as count from auditoria where entidad_id=$1',[user])).rows[0].count,0);
  }finally{await db.exec('drop trigger fail_retirement on publicacion_recurso;drop function fail_retirement()');}
});
test('self-suspension is explicit and the same administrator token loses protected access afterward',async()=>{
  const {actor}=await fixture(),current=await detail(actor);
  assert.equal((await request(stateRoute(actor),stateBody(current.version))).status,200);
  assert.equal((await request('/auth/me')).status,403);
  assert.equal((await request(route())).status,403);
});
test('account-state migration repeats with no schema/data changes and blocks direct client retirement reversal',async()=>{
  const {user}=await fixture();const id=await publication(user),current=await detail(user);
  await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'));
  const columns=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  const data=(await db.query('select * from publicacion_recurso order by id')).rows;
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_07_estado_cuenta.sql','utf8'));
  assert.deepEqual((await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,columns);
  assert.deepEqual((await db.query('select * from publicacion_recurso order by id')).rows,data);
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    try{
      await assert.rejects(db.query('update publicacion_recurso set deleted_at=null where id=$1',[id]),/permission denied/);
      await assert.rejects(db.query('delete from publicacion_recurso where id=$1',[id]),/permission denied/);
      await assert.rejects(db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1",[user]),/permission denied/);
    }finally{await db.exec('reset role');}
  }
});
test('existing trusted server privileges can lock and retire publications after the minimal migration',async()=>{
  const {user}=await fixture();const id=await publication(user),current=await detail(user);
  await db.exec('set role service_role');
  try{
    const response=await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'));
    assert.equal(response.status,200);assert.ok((await db.query('select deleted_at from publicacion_recurso where id=$1',[id])).rows[0].deleted_at);
  }finally{await db.exec('reset role');}
});
after(async () => {
  globalThis.fetch = originalFetch; await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  await closePostgres(); mock.restoreAll(); await db.close();
});
async function profile(at = campus, name = 'User') {
  const id = randomUUID();
  await db.query('insert into auth.users(id) values ($1)',[id]);
  await db.query('insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values ($1,$2,$3,$4,now())',[id,institution,at,name]);
  return id;
}
async function fixture() {
  invalidAuth = false; dbFailure = false;
  imageSigns=[];imageFailure=false;
  mongoEntries=[];mongoDocuments=[];participationEvents=[];mongoMap=null;mongoReads=0;mongoFailure=false;
  authUser = await profile(campus,'Administrator');
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[authUser,roles.ADMINISTRADOR,campus]);
  return { actor: authUser, user: await profile() };
}
async function request(path: string, body?: unknown, authorization = 'Bearer ' + token) {
  return originalFetch(base + path, {method:body === undefined ? 'GET' : 'PATCH',
    headers:{Authorization:authorization,'Content-Type':'application/json'},body:body === undefined ? undefined : JSON.stringify(body)});
}
async function detail(user: string, at = campus) {
  const response = await request(route(user,at)); assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store'); return (await response.json()).data;
}
const payload = (version: string, roleIds: string[] = [], permissionIds: string[] = []) => ({version,roleIds,permissionIds});

test('HTTP validates identity, administrator and campus before listing or reading targets', async () => {
  const {user} = await fixture();
  for (const path of ['/users/access/campuses',route(),route(user),route() + '/../catalog']) {
    assert.equal((await request(path,undefined,'')).status,401);
  }
  invalidAuth = true; assert.equal((await request(route(user))).status,401); invalidAuth = false;
  assert.equal((await request(route(user,otherCampus))).status,403);
  const outsider = await profile(otherCampus);
  assert.equal((await request(route(outsider))).status,404);
  assert.equal((await request(route(randomUUID()))).status,404);
  authUser = user;
  assert.equal((await request(route())).status,403);
  assert.equal((await request('/users/access/campuses')).status,403);
});
test('administrator lists only assigned active campuses, independently from own current campus', async () => {
  const {actor} = await fixture();
  await db.query('update perfil_usuario set campus_id=$1 where id=$2',[otherCampus,actor]);
  const response = await request('/users/access/campuses');
  assert.deepEqual((await response.json()).data,[{id:campus,name:'Home'}]);
  assert.equal((await request(route())).status,200);
  assert.equal((await request(route(undefined,otherCampus))).status,403);
});
test('catalog is separate roles/two and permissions/three; paginated users exclude other campuses and deleted profiles', async () => {
  await fixture();
  const foreign = await profile(otherCampus), deleted = await profile();
  await db.query('update perfil_usuario set deleted_at=now() where id=$1',[deleted]);
  const catalogResponse = await request('/users/access/campuses/' + campus + '/catalog');
  const catalog = (await catalogResponse.json()).data;
  assert.equal(catalog.roles.length,2); assert.equal(catalog.permissions.length,3);
  const first = await request(route() + '?page=1&limit=1'), body = await first.json();
  const count=Number((await db.query<{total:string}>('select count(*)::text as total from perfil_usuario where campus_id=$1 and institucion_id=$2 and deleted_at is null',[campus,institution])).rows[0].total);
  assert.equal(body.data.length,1); assert.deepEqual(body.meta,{page:1,limit:1,hasMore:true,total:count});
  const all = (await (await request(route() + '?limit=100')).json()).data;
  assert.ok(all.every((row:{campusId:string;userId:string}) => row.campusId === campus && ![foreign,deleted].includes(row.userId)));
  for (const query of ['?page=0','?limit=101','?page=1&page=2']) assert.equal((await request(route() + query)).status,400);
});
test('access account detail projects Auth registration, email and all associated local careers without extending the user list', async () => {
  const {user}=await fixture(),a=randomUUID(),b=randomUUID(),foreign=randomUUID(),otherInstitution=randomUUID();
  const registration='2025-03-15T14:27:08.123456Z';
  await db.query("update auth.users set email='  camila@duocuc.cl  ',created_at=$2::timestamptz,encrypted_password='PRIVATE AUTH HASH' where id=$1",[user,registration]);
  await db.query("update perfil_usuario set created_at='2026-01-01',verificado_en='2026-01-02' where id=$1",[user]);
  await db.query("insert into institucion(id,nombre) values($1,'Other account institution')",[otherInstitution]);
  await db.query("insert into carrera(id,institucion_id,nombre,activo) values($1,$4,'Analista Programador',true),($2,$4,'Ingeniería en Informática',false),($3,$5,'PRIVATE FOREIGN CAREER',true)",[a,b,foreign,institution,otherInstitution]);
  for(const career of [b,a,foreign])await db.query('insert into usuario_carrera(perfil_usuario_id,carrera_id) values($1,$2)',[user,career]);
  const account=await detail(user);
  assert.equal(account.email,'camila@duocuc.cl');assert.equal(account.registeredAt,registration);
  assert.deepEqual(account.careers,[{id:a,name:'Analista Programador'},{id:b,name:'Ingeniería en Informática'}]);
  assert.doesNotMatch(JSON.stringify(account),/PRIVATE AUTH HASH|encrypted_password|PRIVATE FOREIGN CAREER/);
  const listing=await (await request(route()+'?limit=100')).json();
  assert.ok(listing.data.every((row:object)=>!['email','careers','registeredAt'].some(key=>Object.hasOwn(row,key))));
  assert.doesNotMatch(JSON.stringify(listing),/camila@duocuc.cl|Ingeniería en Informática/);
  const version=account.version;
  await db.query("update auth.users set email='nuevo@duocuc.cl' where id=$1",[user]);
  const current=await detail(user);assert.equal(current.email,'nuevo@duocuc.cl');assert.equal(current.version,version);
});
test('account search matches profile OR Auth email before pagination, restricted to the authorized campus and institution', async () => {
  const {user}=await fixture(),expected:string[]=[];
  for(let index=0;index<25;index++){
    const id=await profile(campus,'Cuenta filtro '+String(index).padStart(2,'0'));expected.push(id);
    await db.query('update auth.users set email=$2 where id=$1',[id,`busqueda+${index}@duocuc.cl`]);
  }
  const named=await profile(campus,'BUSQUEDA por nombre');expected.push(named);
  const foreign=await profile(otherCampus,'Busqueda privada de otra sede'),deleted=await profile(campus,'Busqueda eliminada');
  const wrongInstitution=randomUUID();await db.query("insert into institucion(id,nombre) values($1,'Foreign search institution')",[wrongInstitution]);
  const wrong=await profile(campus,'Busqueda privada de otra institución');await db.query('update perfil_usuario set institucion_id=$2 where id=$1',[wrong,wrongInstitution]);
  await db.query('update perfil_usuario set deleted_at=now() where id=$1',[deleted]);
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[expected[0]]);
  const search=(page:number)=>(new URLSearchParams({page:String(page),limit:'20',q:'  BUSQUEDA  '})).toString();
  const first=await (await request(route()+'?'+search(1))).json(),second=await (await request(route()+'?'+search(2))).json();
  assert.equal(first.data.length,20);assert.equal(first.meta.hasMore,true);assert.equal(second.data.length,6);assert.equal(second.meta.hasMore,false);
  assert.equal(first.meta.total,26);assert.equal(second.meta.total,26);
  const rows=[...first.data,...second.data];assert.deepEqual(rows.map(row=>row.userId).sort(),expected.sort());assert.equal(new Set(rows.map(row=>row.userId)).size,26);
  assert.ok(rows.every(row=>row.campusId===campus&&!['email','careers','registeredAt'].some(key=>Object.hasOwn(row,key))));
  assert.doesNotMatch(JSON.stringify([first,second]),/busqueda\+|privada|eliminada/);
  const fullEmail=await (await request(route()+'?'+new URLSearchParams({q:'BUSQUEDA+0@DUOCUC.CL'}))).json();
  assert.equal(fullEmail.data.length,1);assert.equal(fullEmail.data[0].userId,expected.find(id=>id===rows.find(row=>row.fullName==='Cuenta filtro 00').userId));
  const moved=rows.find(row=>row.userId!==named).userId;await db.query('update perfil_usuario set campus_id=$2 where id=$1',[moved,otherCampus]);
  const afterMove=await (await request(route()+'?'+new URLSearchParams({q:'busqueda',limit:'100'}))).json();assert.equal(afterMove.data.length,25);assert.equal(afterMove.meta.total,25);assert.ok(afterMove.data.every(row=>row.userId!==moved));
  const unchanged=await detail(user);assert.equal(unchanged.roles.length,0);
});
test('account name/email search treats special characters literally and accepts empty queries without extending the response', async () => {
  const {user}=await fixture();await db.query("update auth.users set email=$2 where id=$1",[user,"o'connor%_+@duocuc.cl"]);
  for(const q of ["%_+","O'CONNOR",'@DUOCUC.CL']){
    const result=await (await request(route()+'?'+new URLSearchParams({q,limit:'100'}))).json();assert.ok(result.data.some(row=>row.userId===user),q);
    if(q!=='@DUOCUC.CL')assert.equal(result.data.length,1);
  }
  const injection=await (await request(route()+'?'+new URLSearchParams({q:"' OR 1=1 --"}))).json();assert.deepEqual(injection.data,[]);
  const plain=await (await request(route()+'?limit=100')).json(),empty=await (await request(route()+'?limit=100&q=%20%20')).json();assert.deepEqual(empty,plain);
});
test('account pagination reports exact scoped totals for numbered pages, out-of-range, shrinking and empty results', async () => {
  const {actor}=await fixture(),scoped=randomUUID();
  await db.query("insert into campus(id,institucion_id,nombre) values($1,$2,'Pagination campus')",[scoped,institution]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values($1,$2,$3)',[actor,roles.ADMINISTRADOR,scoped]);
  const expected:string[]=[];
  for(let index=0;index<41;index++)expected.push(await profile(scoped,'Paginar cuenta '+String(index).padStart(2,'0')));
  await profile(scoped,'Otro nombre');const deleted=await profile(scoped,'Paginar eliminada');await db.query('update perfil_usuario set deleted_at=now() where id=$1',[deleted]);
  const all:string[]=[];
  for(const page of [1,2,3,9]){
    const result=await (await request(route(undefined,scoped)+'?'+new URLSearchParams({page:String(page),limit:'20',q:'PAGINAR'}))).json();
    assert.deepEqual(result.meta,{page,limit:20,hasMore:page<3,total:41});
    assert.equal(result.data.length,page<3?20:page===3?1:0);if(page<=3)all.push(...result.data.map(row=>row.userId));
  }
  assert.deepEqual(all.sort(),expected.sort());assert.equal(new Set(all).size,41);
  const empty=await (await request(route(undefined,scoped)+'?q=sin-coincidencia')).json();assert.deepEqual(empty.data,[]);assert.equal(empty.meta.total,0);assert.equal(empty.meta.hasMore,false);
  await db.query('update perfil_usuario set deleted_at=now() where id=any($1::uuid[])',[expected.slice(0,2)]);
  const reduced=await (await request(route(undefined,scoped)+'?page=3&limit=20&q=paginar')).json();assert.deepEqual(reduced.data,[]);assert.equal(reduced.meta.total,39);
});
test('account search rejects malformed queries and rechecks administrator/campus authorization', async () => {
  const {actor,user}=await fixture();
  for(const query of ['q=a&q=b','q[]=a','q[name]=a','q='+ 'x'.repeat(255),'q=a%00b','q=a%0Ab','q=a%7Fb'])assert.equal((await request(route()+'?'+query)).status,400,query);
  assert.equal((await request(route()+'?q=mail',undefined,'')).status,401);
  assert.equal((await request(route(undefined,otherCampus)+'?q=mail')).status,403);
  authUser=user;assert.equal((await request(route()+'?q=mail')).status,403);authUser=actor;
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]).then(()=>{});
  assert.equal((await request(route()+'?q=mail')).status,403);
});
test('access profile metadata survives role saves, account-state changes and state no-ops', async () => {
  const {user}=await fixture(),career=randomUUID();
  await db.query("update auth.users set email='perfil@duocuc.cl',created_at='2025-05-01T12:00:00Z' where id=$1",[user]);
  await db.query("insert into carrera(id,institucion_id,nombre) values($1,$2,'Diseño')",[career,institution]);
  await db.query('insert into usuario_carrera(perfil_usuario_id,carrera_id) values($1,$2)',[user,career]);
  const original=await detail(user);
  const check=(value:any)=>{assert.equal(value.email,original.email);assert.equal(value.registeredAt,original.registeredAt);assert.deepEqual(value.careers,original.careers)};
  let response=await request(route(user),payload(original.version,[roles.USUARIO_AUTORIZADO],[permissions.PUBLICAR_EVENTO]));
  assert.equal(response.status,200);let current=(await response.json()).data;check(current);
  for(const state of ['SUSPENDIDA','SUSPENDIDA','DESACTIVADA']){
    response=await request(stateRoute(user),stateBody(current.version,state));assert.equal(response.status,200);current=(await response.json()).data;check(current);
  }
  check(await detail(user));
});
test('access detail distinguishes missing email, registration and empty careers without inventing values', async () => {
  const {user}=await fixture();await db.query("update auth.users set email='  ',created_at=null where id=$1",[user]);
  const account=await detail(user);assert.equal(account.email,null);assert.equal(account.registeredAt,null);assert.deepEqual(account.careers,[]);
});
test('account profile grants are repeatable, column-limited and restricted to the trusted server', async () => {
  const migration=await readFile('src/database/supabase/migrations/f2_3_05_account_profile_read.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  for(const role of ['anon','authenticated','service_role']){
    for(const column of ['id','email','created_at','encrypted_password']){
      const {rows}=await db.query<{allowed:boolean}>("select has_column_privilege($1,'auth.users',$2,'SELECT') as allowed",[role,column]);
      assert.equal(rows[0].allowed,role==='service_role'&&column!=='encrypted_password');
    }
  }
});
test('account metadata is withheld from unauthorized, foreign, moved, wrong-institution and deleted targets', async () => {
  const {actor,user}=await fixture(),foreign=await profile(otherCampus);
  for(const id of [user,foreign])await db.query("update auth.users set email='PRIVATE ACCOUNT EMAIL',encrypted_password='PRIVATE AUTH HASH' where id=$1",[id]);
  const deny=async(path:string,status:number,authorization?:string)=>{const response=await request(path,undefined,authorization);assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/PRIVATE ACCOUNT EMAIL|PRIVATE AUTH HASH|registeredAt|careers/)};
  await deny(route(user),401,'');await deny(route(user,otherCampus),403);await deny(route(foreign),404);
  authUser=user;await deny(route(actor),403);authUser=actor;
  beforeTransaction=()=>db.query('update perfil_usuario set campus_id=$2 where id=$1',[user,otherCampus]).then(()=>{});
  await deny(route(user),404);
  await db.query('update perfil_usuario set campus_id=$2,deleted_at=now() where id=$1',[user,campus]);await deny(route(user),404);
  const wrongInstitution=randomUUID();await db.query("insert into institucion(id,nombre) values($1,'Foreign private institution')",[wrongInstitution]);
  await db.query('update perfil_usuario set deleted_at=null,institucion_id=$2 where id=$1',[user,wrongInstitution]);await deny(route(user),404);
  await db.query('update perfil_usuario set institucion_id=$2 where id=$1',[user,institution]);
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]).then(()=>{});
  await deny(route(user),403);
});
test('grant, modify, revoke and regrant preserve history, actors and complete before/after audit', async () => {
  const {actor,user} = await fixture();
  let current = await detail(user);
  const save = async (roleIds:string[],permissionIds:string[]) => {
    const response = await request(route(user),payload(current.version,roleIds,permissionIds)); assert.equal(response.status,200);
    current = (await response.json()).data;
  };
  await save([roles.USUARIO_AUTORIZADO],[permissions.PUBLICAR_EVENTO]);
  assert.equal(current.roles[0].campus_id,campus); assert.equal(current.permissions.length,1);
  const firstRole = current.roles[0].id;
  await save([roles.ADMINISTRADOR],[permissions.ACCEDER_REPORTERIA]);
  await save([],[]);
  await save([roles.USUARIO_AUTORIZADO],[]);
  assert.notEqual(current.roles[0].id,firstRole);
  const rows = (await db.query('select * from usuario_rol where perfil_usuario_id=$1 order by asignado_en',[user])).rows;
  assert.equal(rows.length,3); assert.ok(rows[0].revocado_en); assert.ok(rows[1].revocado_en); assert.equal(rows[2].revocado_en,null);
  assert.ok(rows.every(row => row.asignado_por_id === actor && row.campus_id === campus));
  const audit = (await db.query('select * from auditoria where entidad_id=$1 order by created_at,id',[user])).rows;
  assert.equal(audit.length,9); assert.ok(audit.every(row => row.actor_usuario_id === actor && row.campus_id === campus && row.institucion_id === institution));
  assert.ok(audit.some(row => row.accion === 'REVOCAR_ROL' && row.datos_antes.roles.some((role:{id:string}) => role.id === firstRole)));
  assert.ok(audit.every(row => row.datos_antes.roles && row.datos_despues.permissions));
  assert.ok(audit.every(row => row.datos_antes.assignmentId && row.datos_despues.catalogId));
});
test('eight independent permission combinations are effective on next /me using the same token', async () => {
  const {actor,user} = await fixture();
  const permissionIds = [permissions.PUBLICAR_EVENTO,permissions.ACCEDER_ANALITICA,permissions.ACCEDER_REPORTERIA];
  for (let mask=0; mask<8; mask++) {
    authUser = actor; const current = await detail(user);
    const response = await request(route(user),payload(current.version,[roles.USUARIO_AUTORIZADO],permissionIds.filter((_,i) => mask & (1<<i))));
    assert.equal(response.status,200);
    authUser = user; const me = (await (await request('/auth/me')).json()).data;
    assert.deepEqual(me.capabilities,{general:true,officialActivities:Boolean(mask&1),analytics:Boolean(mask&2),reports:Boolean(mask&4)});
  }
  authUser=actor; const current=await detail(user);
  await request(route(user),payload(current.version,[],[])); authUser=user;
  assert.deepEqual((await (await request('/auth/me')).json()).data.capabilities,{general:true,officialActivities:false,analytics:false,reports:false});
});
test('permission alone grants no special function; administrator has all without permission rows', async () => {
  const {actor,user}=await fixture(); let current=await detail(user);
  assert.equal((await request(route(user),payload(current.version,[],[permissions.ACCEDER_REPORTERIA]))).status,200);
  authUser=user; assert.equal((await (await request('/auth/me')).json()).data.capabilities.reports,false);
  authUser=actor; current=await detail(user);
  await request(route(user),payload(current.version,[roles.ADMINISTRADOR],[])); authUser=user;
  assert.deepEqual((await (await request('/auth/me')).json()).data.capabilities,{general:true,officialActivities:true,analytics:true,reports:true});
});
test('stale editing version returns 409 and idempotent save does not duplicate grants/audit', async () => {
  const {user}=await fixture(); const initial=await detail(user);
  const response=await request(route(user),payload(initial.version,[roles.USUARIO_AUTORIZADO],[])); const updated=(await response.json()).data;
  assert.equal((await request(route(user),payload(initial.version,[],[]))).status,409);
  const before=(await db.query('select * from auditoria where entidad_id=$1',[user])).rows;
  assert.equal((await request(route(user),payload(updated.version,[roles.USUARIO_AUTORIZADO],[]))).status,200);
  assert.deepEqual((await db.query('select * from auditoria where entidad_id=$1',[user])).rows,before);
});
test('role revocation since editor opened and suspended actor are rejected; target campus movement returns 404', async () => {
  const {actor,user}=await fixture(); const current=await detail(user);
  await db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]);
  assert.equal((await request(route(user),payload(current.version,[],[]))).status,403);
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1',[actor]);
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[actor]);
  assert.equal((await request(route(user))).status,403);
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1",[actor]);
  await db.query('update perfil_usuario set campus_id=$1 where id=$2',[otherCampus,user]);
  assert.equal((await request(route(user),payload(current.version,[roles.ADMINISTRADOR],[]))).status,404);
});
test('malformed body, extra actor/state, duplicate IDs and out-of-catalog grants cannot write', async () => {
  const {user}=await fixture(); const current=await detail(user);
  for (const body of [null,[],{}, {...payload(current.version),actorId:authUser}, {...payload(current.version),estado_cuenta:'ACTIVA'},
    payload(current.version,[roles.ADMINISTRADOR,roles.ADMINISTRADOR]),payload(current.version,[randomUUID()]),
    payload(current.version,[],['bad']),payload('bad')]) assert.equal((await request(route(user),body)).status,400);
  assert.equal((await detail(user)).version,current.version);
  assert.equal((await request('/users/access/campuses/bad/users')).status,400);
});
test('service rechecks role and actor state changed after HTTP authentication but before transaction', async () => {
  const {actor,user}=await fixture(); const current=await detail(user);
  beforeTransaction=async () => { await db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]); };
  assert.equal((await request(route(user),payload(current.version,[roles.ADMINISTRADOR],[]))).status,403);
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1',[actor]);
  beforeTransaction=async () => { await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[actor]); };
  assert.equal((await request(route(user),payload(current.version,[roles.ADMINISTRADOR],[]))).status,403);
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1",[actor]);
  assert.equal((await detail(user)).version,current.version);
});
test('auditing failure rolls back both grants and revocations and sanitizes failure', async () => {
  const {user}=await fixture(); const initial=await detail(user);
  await request(route(user),payload(initial.version,[roles.USUARIO_AUTORIZADO],[permissions.PUBLICAR_EVENTO]));
  const current=await detail(user);
  await db.exec("create function fail_access_audit() returns trigger language plpgsql as $$begin raise exception 'private failure secret'; end$$; create trigger fail_access_audit before insert on auditoria for each row execute function fail_access_audit();");
  try {
    const response=await request(route(user),payload(current.version,[roles.ADMINISTRADOR],[]));
    assert.equal(response.status,503); assert.doesNotMatch(await response.text(),/private|secret|password/);
    assert.equal((await detail(user)).version,current.version);
    assert.equal((await db.query('select count(*)::int as count from usuario_rol where perfil_usuario_id=$1',[user])).rows[0].count,1);
  } finally { await db.exec('drop trigger fail_access_audit on auditoria; drop function fail_access_audit()'); }
});
test('inactive campus, unconfigured catalog and database outages fail safely', async () => {
  const {user}=await fixture();
  await db.query('update campus set activo=false where id=$1',[campus]);
  assert.equal((await request(route(user))).status,403); await db.query('update campus set activo=true where id=$1',[campus]);
  await db.query("update permiso set nombre='UNCONFIGURED' where id=$1",[permissions.PUBLICAR_EVENTO]);
  assert.equal((await request('/users/access/campuses/' + campus + '/catalog')).status,503);
  await db.query("update permiso set nombre='PUBLICAR_EVENTO' where id=$1",[permissions.PUBLICAR_EVENTO]);
  dbFailure=true;
  try { const response=await request(route(user)); assert.equal(response.status,503); assert.doesNotMatch(await response.text(),/private|password/); }
  finally { dbFailure=false; }
});
test('writes affect only requested campus and leave other-campus assignments intact', async () => {
  const {user}=await fixture();
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[user,roles.ADMINISTRADOR,otherCampus]);
  const before=(await db.query('select * from usuario_rol where perfil_usuario_id=$1 and campus_id=$2',[user,otherCampus])).rows;
  const current=await detail(user); await request(route(user),payload(current.version,[roles.USUARIO_AUTORIZADO],[]));
  assert.deepEqual((await db.query('select * from usuario_rol where perfil_usuario_id=$1 and campus_id=$2',[user,otherCampus])).rows,before);
  authUser=user; assert.equal((await (await request('/auth/me')).json()).data.capabilities.reports,false);
});
test('migration repeats without new tables/columns, keeps UUIDs and enforces active uniqueness', async () => {
  const {user}=await fixture();
  const columns=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  const before=(await db.query('select * from rol order by nombre')).rows;
  await db.exec(await migration());
  assert.deepEqual((await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,columns);
  assert.deepEqual((await db.query('select * from rol order by nombre')).rows,before);
  const insert=() => db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[user,roles.USUARIO_AUTORIZADO,campus]);
  await insert(); await assert.rejects(insert(),/unique/);
  await db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[user]); await insert();
});
test('anonymous/authenticated cannot bypass Express and own RLS excludes historical or other-user assignments', async () => {
  const {actor,user}=await fixture(); const current=await detail(user);
  await request(route(user),payload(current.version,[roles.USUARIO_AUTORIZADO],[]));
  await db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[user]);
  await db.query("select set_config('test.user',$1,false)",[actor]);
  for (const role of ['anon','authenticated']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(db.query('delete from usuario_rol where perfil_usuario_id=$1',[actor]),/permission denied/);
      await assert.rejects(db.query('insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id) values ($1,$2,$3)',[actor,permissions.PUBLICAR_EVENTO,campus]),/permission denied/);
      await assert.rejects(db.query("update rol set nombre='HACKED'"),/permission denied/);
      await assert.rejects(db.query('select * from auditoria'),/permission denied/);
      if (role === 'authenticated') {
        const rows=(await db.query('select * from usuario_rol')).rows;
        assert.equal(rows.length,1); assert.equal(rows[0].perfil_usuario_id,actor);
      }
    } finally { await db.exec('reset role'); }
  }
});

const auditRoute = (id?: string, at = campus) => '/users/access/campuses/' + at + '/audit' + (id ? '/' + id : '');
async function seedAudit(actor: string | null, entity: string, at: string | null = campus, before: unknown = null, after: unknown = null) {
  const id = randomUUID();
  await db.query(`insert into auditoria(id,actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,datos_antes,datos_despues)
    values ($1,$2,$3,$4,'perfil_usuario',$5,'SUSPENDER_CUENTA',$6::jsonb,$7::jsonb)`,
    [id,actor,institution,at,entity,JSON.stringify(before),JSON.stringify(after)]);
  return id;
}
async function auditDetail(id: string, at = campus) {
  const response = await request(auditRoute(id,at)); assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store'); return (await response.json()).data;
}

test('audit requires session and current administrator scope for both list and detail', async () => {
  const {actor,user} = await fixture(), id = await seedAudit(actor,user);
  for (const path of [auditRoute(),auditRoute(id)]) {
    assert.equal((await request(path,undefined,'')).status,401);
    invalidAuth=true; try { assert.equal((await request(path)).status,401); } finally { invalidAuth=false; }
    authUser=user; assert.equal((await request(path)).status,403); authUser=actor;
  }
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[user,roles.USUARIO_AUTORIZADO,campus]);
  await db.query('insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id) values ($1,$2,$3)',[user,permissions.ACCEDER_REPORTERIA,campus]);
  authUser=user;
  for (const path of [auditRoute(),auditRoute(id)]) assert.equal((await request(path)).status,403);
});

test('audit hides foreign UUIDs, institution mismatches and campusless records without trusting query campus', async () => {
  const {actor,user} = await fixture(), foreign=await seedAudit(actor,user,otherCampus), global=await seedAudit(actor,user,null);
  assert.equal((await request(auditRoute(undefined,otherCampus))).status,403);
  assert.equal((await request(auditRoute(foreign,otherCampus))).status,403);
  const missing=await request(auditRoute(randomUUID()));
  for(const id of [foreign,global]) {
    const response=await request(auditRoute(id)); assert.equal(response.status,404);
    assert.deepEqual(await response.json(),await missing.clone().json());
  }
  const wrongInstitution=randomUUID(), mismatch=await seedAudit(actor,user);
  await db.query("insert into institucion(id,nombre) values ($1,'Other institution')",[wrongInstitution]);
  await db.query('update auditoria set institucion_id=$1 where id=$2',[wrongInstitution,mismatch]);
  assert.equal((await request(auditRoute(mismatch))).status,404);
  const response=await request(auditRoute()+'?campusId='+otherCampus+'&limit=100'); assert.equal(response.status,200);
  const body=await response.json();assert.ok(body.data.every((row:{campus_id:string;institucion_id:string})=>row.campus_id===campus && row.institucion_id===institution));
  assert.ok(body.data.every((row:{id:string})=>![foreign,global,mismatch].includes(row.id)));
});

test('audit pagination is bounded and ordered by original microsecond time then UUID', async () => {
  const {actor,user} = await fixture(), scoped=randomUUID();
  await db.query("insert into campus(id,institucion_id,nombre) values ($1,$2,'History')",[scoped,institution]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[actor,roles.ADMINISTRADOR,scoped]);
  const ids=[];
  for(let i=0;i<3;i++) ids.push(await seedAudit(actor,user,scoped));
  await db.query("update auditoria set created_at='2026-10-09T10:00:00.123456Z' where id=any($1::uuid[])",[ids]);
  ids.sort().reverse();
  const first=await request(auditRoute(undefined,scoped)+'?page=1&limit=2');assert.equal(first.status,200);
  assert.equal(first.headers.get('cache-control'),'no-store');const one=await first.json();
  assert.deepEqual(one.data.map((row:{id:string})=>row.id),ids.slice(0,2));assert.deepEqual(one.meta,{page:1,limit:2,hasMore:true,total:3});
  assert.ok(one.data.every((row:{created_at:string})=>row.created_at==='2026-10-09T10:00:00.123456Z'));
  assert.ok(one.data.every((row:object)=>!Object.hasOwn(row,'datos_antes')));
  const two=await (await request(auditRoute(undefined,scoped)+'?page=2&limit=2')).json();
  assert.deepEqual(two.data.map((row:{id:string})=>row.id),ids.slice(2));assert.equal(two.meta.hasMore,false);
  const empty=await (await request(auditRoute(undefined,scoped)+'?page=3&limit=2')).json();assert.deepEqual(empty.data,[]);
  for(const query of ['?page=0','?limit=101','?page=1&page=2','?limit=1.5','?page=999999999999999999999'])
    assert.equal((await request(auditRoute(undefined,scoped)+query)).status,400);
  assert.equal((await request('/users/access/campuses/bad/audit')).status,400);
  assert.equal((await request(auditRoute('bad'))).status,400);
});

test('audit action filter applies before pagination and preserves campus authorization and history order', async () => {
  const {actor,user}=await fixture(), scoped=randomUUID();
  await db.query("insert into campus(id,institucion_id,nombre) values ($1,$2,'Filtered history')",[scoped,institution]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[actor,roles.ADMINISTRADOR,scoped]);
  const matching=[];
  for(let index=0;index<5;index++) matching.push(await seedAudit(actor,user,scoped));
  await db.query("update auditoria set accion='ASIGNAR_PERMISO',created_at='2026-10-09T10:00:00.123456Z' where id=any($1::uuid[])",[matching]);
  // Más de una página de acciones diferentes y más recientes no debe ocultar coincidencias posteriores.
  for(let index=0;index<24;index++) await seedAudit(actor,user,scoped);
  const foreign=await seedAudit(actor,user,otherCampus);
  await db.query("update auditoria set accion='ASIGNAR_PERMISO' where id=$1",[foreign]);
  matching.sort().reverse();
  for(const page of [1,2,3]) {
    const response=await request(auditRoute(undefined,scoped)+`?action=ASIGNAR_PERMISO&limit=2&page=${page}&campusId=${otherCampus}`);
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const result=await response.json();
    assert.deepEqual(result.data.map((row:{id:string})=>row.id),matching.slice((page-1)*2,page*2));
    assert.deepEqual(result.meta,{page,limit:2,hasMore:page<3,total:5});
    assert.ok(result.data.every((row:{accion:string;campus_id:string;institucion_id:string})=>row.accion==='ASIGNAR_PERMISO'&&row.campus_id===scoped&&row.institucion_id===institution));
  }
  const empty=await (await request(auditRoute(undefined,scoped)+'?action=ASIGNAR_PERMISO&limit=2&page=4')).json();
  assert.deepEqual(empty.data,[]);assert.equal(empty.meta.hasMore,false);
  assert.equal((await request(auditRoute(undefined,otherCampus)+'?action=ASIGNAR_PERMISO')).status,403);
  authUser=user;assert.equal((await request(auditRoute(undefined,scoped)+'?action=ASIGNAR_PERMISO')).status,403);
});

test('audit action filter accepts existing actions and rejects unknown, repeated, nested or injected values', async () => {
  await fixture();
  const {AUDIT_ACTIONS}=await import('../src/modules/users/types/access.types.js');
  for(const action of AUDIT_ACTIONS) assert.equal((await request(auditRoute()+'?action='+action)).status,200);
  for(const query of ['action=', 'action=UNKNOWN', 'action=asignar_rol', 'action=ASIGNAR_ROL&action=REVOCAR_ROL',
    'action[]=ASIGNAR_ROL', 'action[name]=ASIGNAR_ROL', 'action='+encodeURIComponent("ASIGNAR_ROL' OR 1=1 --")]) {
    assert.equal((await request(auditRoute()+'?'+query)).status,400,query);
  }
});

test('audit dates filter before pagination with inclusive start, exclusive end, action and campus isolation', async () => {
  const {actor,user}=await fixture(), scoped=randomUUID();
  await db.query("insert into campus(id,institucion_id,nombre) values ($1,$2,'Date history')",[scoped,institution]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[actor,roles.ADMINISTRADOR,scoped]);
  const stamps=['2026-10-27T02:59:59.999999Z','2026-10-27T03:00:00.000000Z','2026-10-27T12:00:00.000000Z',
    '2026-10-28T02:59:59.999999Z','2026-10-28T03:00:00.000000Z'],ids=[];
  for(const stamp of stamps) {
    const id=await seedAudit(actor,user,scoped);ids.push(id);
    await db.query("update auditoria set accion='ASIGNAR_PERMISO',created_at=$2::timestamptz where id=$1",[id,stamp]);
  }
  const different=await seedAudit(actor,user,scoped), foreign=await seedAudit(actor,user,otherCampus),wrongInstitution=await seedAudit(actor,user,scoped);
  await db.query("update auditoria set created_at='2026-10-27T12:00:00Z' where id=any($1::uuid[])",[[different,foreign,wrongInstitution]]);
  await db.query("update auditoria set accion='ASIGNAR_PERMISO' where id=any($1::uuid[])",[[foreign,wrongInstitution]]);
  const otherInstitution=randomUUID();await db.query("insert into institucion(id,nombre) values($1,'Other institution')",[otherInstitution]);
  await db.query('update auditoria set institucion_id=$2 where id=$1',[wrongInstitution,otherInstitution]);
  const query=new URLSearchParams({from:'2026-10-27T03:00:00.000Z',before:'2026-10-28T03:00:00.000Z',action:'ASIGNAR_PERMISO',limit:'2'});
  for(const page of [1,2]) {
    query.set('page',String(page));
    const response=await request(auditRoute(undefined,scoped)+'?'+query);assert.equal(response.status,200);
    const result=await response.json();
    assert.deepEqual(result.data.map((row:{id:string})=>row.id),[ids[3],ids[2],ids[1]].slice((page-1)*2,page*2));
    assert.equal(result.meta.hasMore,page===1);
  }
  query.delete('action');query.set('limit','100');query.set('page','1');
  const all=(await (await request(auditRoute(undefined,scoped)+'?'+query)).json()).data;
  assert.equal(all.length,4);assert.ok(all.some((row:{id:string})=>row.id===different));
  query.set('from','2020-01-01T00:00:00.000Z');query.set('before','2020-01-02T00:00:00.000Z');
  const empty=await (await request(auditRoute(undefined,scoped)+'?'+query)).json();assert.deepEqual(empty.data,[]);assert.equal(empty.meta.hasMore,false);
  assert.equal((await request(auditRoute(undefined,otherCampus)+'?'+query)).status,403);
});

test('audit dates allow either bound and reject invalid, repeated, nested or reversed intervals', async () => {
  const {actor,user}=await fixture(),id=await seedAudit(actor,user);
  await db.query("update auditoria set created_at='2026-10-27T12:00:00Z' where id=$1",[id]);
  for(const bounds of [{from:'2026-10-27T00:00:00.000Z'},{before:'2026-10-28T00:00:00.000Z'}]) {
    const response=await request(auditRoute()+'?'+new URLSearchParams({...bounds,limit:'100'}));assert.equal(response.status,200);
    assert.ok((await response.json()).data.some((row:{id:string})=>row.id===id));
  }
  const valid='2026-10-27T00:00:00.000Z';
  for(const query of ['from=', 'before=no', 'from=2026-02-30T00:00:00.000Z', 'from=2026-10-27',
    'from='+valid+'&from='+valid,'before[]='+valid,'from[x]='+valid,
    'from='+valid+'&before='+valid,'from=2026-10-28T00:00:00.000Z&before='+valid,
    'before='+encodeURIComponent("2026-10-27T00:00:00.000Z' OR 1=1 --")]) {
    assert.equal((await request(auditRoute()+'?'+query)).status,400,query);
  }
});

test('audit shows original role snapshots after catalog edits, target move/deletion and historical actor deactivation', async () => {
  const {actor,user}=await fixture(); let current=await detail(user);
  const response=await request(route(user),payload(current.version,[roles.USUARIO_AUTORIZADO],[]));assert.equal(response.status,200);
  const stored=(await db.query('select * from auditoria where entidad_id=$1',[user])).rows[0];
  current=(await response.json()).data;
  await request(route(user),payload(current.version,[],[]));
  await db.query('update perfil_usuario set campus_id=$1,deleted_at=now() where id=$2',[otherCampus,user]);
  const reader=await profile();await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[reader,roles.ADMINISTRADOR,campus]);
  await db.query("update perfil_usuario set estado_cuenta='DESACTIVADA',deleted_at=now() where id=$1",[actor]);authUser=reader;
  await db.query("update rol set nombre='CHANGED_CATALOG' where id=$1",[roles.USUARIO_AUTORIZADO]);
  try {
    const record=await auditDetail(stored.id as string);assert.equal(record.actor_usuario_id,actor);assert.equal(record.entidad_id,user);
    assert.deepEqual(record.datos_antes,stored.datos_antes);assert.deepEqual(record.datos_despues,stored.datos_despues);
    assert.equal(record.datos_despues.roles[0].nombre,'USUARIO_AUTORIZADO');
    assert.ok((await (await request(auditRoute()+'?limit=100')).json()).data.some((row:{id:string})=>row.id===stored.id));
  } finally { await db.query("update rol set nombre='USUARIO_AUTORIZADO' where id=$1",[roles.USUARIO_AUTORIZADO]); }
});

test('audit reads real suspension/deactivation snapshots even after physical publications retire', async () => {
  const {actor,user}=await fixture(),publicationId=await publication(user);let current=await detail(user);
  const suspended=await request(stateRoute(user),stateBody(current.version));assert.equal(suspended.status,200);current=(await suspended.json()).data;
  assert.equal((await request(stateRoute(user),stateBody(current.version,'DESACTIVADA'))).status,200);
  const stored=(await db.query('select * from auditoria where entidad_id=$1 order by created_at,id',[user])).rows;
  assert.equal(stored.length,2);
  for(const row of stored) {
    const record=await auditDetail(row.id as string);assert.equal(record.actor_usuario_id,actor);
    assert.deepEqual(record.datos_antes,row.datos_antes);assert.deepEqual(record.datos_despues,row.datos_despues);
  }
  const retired=await auditDetail(stored[1].id as string);
  assert.equal(retired.datos_antes.publicacion_recurso[0].id,publicationId);
  assert.equal(retired.datos_antes.publicacion_recurso[0].deleted_at,null);assert.ok(retired.datos_despues.publicacion_recurso[0].deleted_at);
  const analytics=await import('../src/modules/analytics/analytics.repository.js');
  const events=(await analytics.readAccountStateAnalyticsEvents(db as never,campus)).filter(row=>row.userId===user);
  assert.deepEqual(events.map(row=>[row.before,row.after]),[['ACTIVA','SUSPENDIDA'],['SUSPENDIDA','DESACTIVADA']]);
  assert.ok(events.every(row=>row.actorId===actor&&row.campusId===campus&&/\.\d{6}Z$/.test(row.occurredAt)));
  // Un corte anterior a la primera suspensión conserva ACTIVA pese al estado actual DESACTIVADA.
  const beforeFirstChange=events[0].before;assert.equal(beforeFirstChange,'ACTIVA');
  await db.query('UPDATE perfil_usuario SET campus_id=$2,deleted_at=clock_timestamp() WHERE id=$1',[user,otherCampus]);
  assert.deepEqual((await analytics.readAccountStateAnalyticsEvents(db as never,campus)).filter(row=>row.userId===user),events);
});

test('audit reads recorded moderation decisions without reconstructing current report or publication', async () => {
  const {actor,user}=await fixture(),publicationId=await publication(user), reportId=randomUUID();
  await db.query(`insert into reporte_contenido(id,reportante_id,campus_id,entidad_tipo,entidad_id,motivo)
    values ($1,$2,$3,'PUBLICACION_FISICA',$4,'Original reason')`,[reportId,user,campus,publicationId]);
  const before={estado_reporte:'PENDIENTE',motivo:'Original reason',estado_publicacion:'DISPONIBLE'};
  const after={estado_reporte:'RESUELTO',fundamento_resolucion:'Original decision',medida_aplicada:'OCULTAR_PUBLICACION',estado_publicacion:'OCULTO'};
  const id=await seedAudit(actor,publicationId,campus,before,after);
  await db.query(`update auditoria set accion='RESOLVER_DENUNCIA',entidad_tipo='publicacion_recurso',
    justificacion_accion='Original decision',reporte_contenido_id=$1 where id=$2`,[reportId,id]);
  await db.query("update reporte_contenido set motivo='Later reason',fundamento_resolucion='Later decision' where id=$1",[reportId]);
  await db.query("update publicacion_recurso set titulo='Later title',deleted_at=now() where id=$1",[publicationId]);
  const record=await auditDetail(id);assert.equal(record.reporte_contenido_id,reportId);assert.equal(record.justificacion_accion,'Original decision');
  assert.deepEqual(record.datos_antes,before);assert.deepEqual(record.datos_despues,after);
});

test('audit never forwards arbitrary JSON secrets or nested session/storage payloads', async () => {
  const {actor,user}=await fixture();
  const id=await seedAudit(actor,user,campus,{password:'hidden password',access_token:'hidden access',refresh_token:'hidden refresh',
    credentials:{secret:'hidden credential'},nombre_completo:{password:'hidden wrong shape'},estado_cuenta:'ACTIVA',
    roles:[{id:'assignment',nombre:'USUARIO_AUTORIZADO',campus_id:campus,session:'hidden session',nested:{api_key:'hidden key'}}],
    permissions:[],publicacion_recurso:[{id:'publication',deleted_at:null,storage_path:'hidden storage',signed_url:'hidden url'}]},
    {estado_cuenta:'SUSPENDIDA',auth:{private_key:'hidden private'}});
  const response=await request(auditRoute(id));assert.equal(response.status,200);const serialized=await response.text();
  assert.doesNotMatch(serialized,/hidden|password|access_token|refresh_token|credentials|session|private_key|signed_url|storage_path/);
  const record=JSON.parse(serialized).data;assert.equal(record.datos_antes.estado_cuenta,'ACTIVA');
  assert.deepEqual(record.datos_antes.roles,[{id:'assignment',nombre:'USUARIO_AUTORIZADO',campus_id:campus}]);
  const absent=await seedAudit(null,user);const empty=await auditDetail(absent);
  assert.equal(empty.actor_usuario_id,null);assert.equal(empty.datos_antes,null);assert.equal(empty.datos_despues,null);
});

test('audit exposes ID plus current reference names without changing original physical publication snapshots', async () => {
  const {actor,user}=await fixture(),publicationId=await publication(user),category=randomUUID();
  await db.query("update perfil_usuario set nombre_completo='Camila actual',deleted_at=now() where id=$1",[user]);
  await db.query("insert into categoria_recurso_fisico(id,nombre) values($1,'Categoría actual')",[category]);
  await db.query("insert into recurso_fisico(publicacion_id,categoria_id,estado_uso) values($1,$2,'BUEN_ESTADO')",[publicationId,category]);
  const {physicalgoodsSnapshot}=await import('../src/modules/marketplace/physicalgoods/physicalgoods.history.repository.js');
  const snapshot=await physicalgoodsSnapshot(db as never,publicationId);
  const id=await seedAudit(actor,publicationId,campus,null,snapshot);
  await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion='OCULTAR_PUBLICACION' where id=$1",[id]);
  await db.query("update publicacion_recurso set titulo='Título actual diferente',deleted_at=now() where id=$1",[publicationId]);
  const stored=(await db.query('select datos_antes,datos_despues from auditoria where id=$1',[id])).rows[0];
  const result=await auditDetail(id);
  assert.deepEqual(result.datos_despues,stored.datos_despues);assert.equal(result.datos_antes,null);
  assert.deepEqual(result.references['datos_despues.propietario_id'],{kind:'user',id:user,name:'Camila actual',source:'current'});
  assert.deepEqual(result.references['datos_despues.categoria_id'],{kind:'category',id:category,name:'Categoría actual',source:'current'});
  assert.deepEqual(result.references['datos_despues.campus_id'],{kind:'campus',id:campus,name:'Home',source:'current'});
  assert.deepEqual(result.references.actor_usuario_id,{kind:'user',id:actor,name:'Administrator',source:'current'});
  assert.deepEqual(result.references.entidad_id,{kind:'publication',id:publicationId,name:'Original title',source:'recorded'});
  assert.equal(result.references['datos_despues.id'].name,'Original title');
  assert.equal(result.references.institucion_id.name,'Test');
  assert.deepEqual((await db.query('select datos_antes,datos_despues from auditoria where id=$1',[id])).rows[0],stored);
});

test('audit keeps before/after recorded names distinct and prefers them over renamed current catalogs', async () => {
  const {actor,user}=await fixture(),assignment=randomUUID(),file=randomUUID(),career=randomUUID(),subject=randomUUID();
  const before={id:user,nombre_completo:'Nombre anterior',roles:[{id:assignment,catalog_id:roles.USUARIO_AUTORIZADO,nombre:'Rol histórico',campus_id:campus}],
    careers:[{id:career,name:'Carrera registrada',code:'REG'}],subjects:[{id:subject,name:'Asignatura registrada',code:'SUB'}],images:[{id:file,nombre_original:'foto-original.png'}]};
  const after={...before,nombre_completo:'Nombre posterior',roles:[{...before.roles[0],nombre:'Otro nombre registrado'}]};
  const id=await seedAudit(actor,user,campus,before,after);
  const result=await auditDetail(id);
  assert.equal(result.references['datos_antes.id'].name,'Nombre anterior');assert.equal(result.references['datos_despues.id'].name,'Nombre posterior');
  assert.equal(result.references['datos_antes.roles.0.catalog_id'].name,'Rol histórico');
  assert.equal(result.references['datos_despues.roles.0.catalog_id'].name,'Otro nombre registrado');
  for(const path of ['datos_antes.id','datos_antes.roles.0.id','datos_antes.roles.0.catalog_id','datos_antes.careers.0.id','datos_antes.subjects.0.id','datos_antes.images.0.id'])
    assert.equal(result.references[path].source,'recorded');
  assert.deepEqual(result.datos_antes,before);assert.deepEqual(result.datos_despues,after);
});

test('audit current reference lookups cannot reveal users, campuses or publications outside authorized scope', async () => {
  const {actor,user}=await fixture(),outsider=await profile(otherCampus,'Foreign campus private name');
  const foreignPublication=await publication(outsider,'FISICO','DISPONIBLE',otherCampus),foreignInstitution=randomUUID();
  await db.query("insert into institucion(id,nombre) values($1,'Foreign institution private name')",[foreignInstitution]);
  const wrongInstitutionUser=await profile(campus,'Wrong institution private name');
  await db.query('update perfil_usuario set institucion_id=$1 where id=$2',[foreignInstitution,wrongInstitutionUser]);
  const id=await seedAudit(actor,user,campus,{propietario_id:outsider,campus_id:otherCampus,institucion_id:foreignInstitution,
    reportante_id:wrongInstitutionUser,publicacion_recurso:[{id:foreignPublication}],password:'unknown secret',session:{perfil_usuario_id:user}},
    {propietario_id:randomUUID(),categoria_id:'invalid-id',roles:[{id:'invalid-assignment',catalog_id:'invalid-catalog'}]});
  const result=await auditDetail(id);
  for(const path of ['datos_antes.propietario_id','datos_antes.campus_id','datos_antes.institucion_id','datos_antes.reportante_id','datos_antes.publicacion_recurso.0.id','datos_despues.propietario_id','datos_despues.categoria_id']) {
    assert.equal(result.references[path].name,null,path);assert.equal(result.references[path].source,'unavailable');
  }
  assert.doesNotMatch(JSON.stringify(result),/Foreign campus private name|Wrong institution private name|Foreign institution private name|unknown secret|session/);
  assert.equal((await request(auditRoute(id,otherCampus))).status,403);
});

test('audit resolves only linked academic names and preserves inactive catalogs for authorized history', async () => {
  const {actor,user}=await fixture(),career=randomUUID(),subject=randomUUID(),foreignCareer=randomUUID(),foreignSubject=randomUUID();
  await db.query("insert into carrera(id,institucion_id,nombre,activo) values($1,$2,'Carrera actual',false),($3,$2,'Carrera ajena',true)",[career,institution,foreignCareer]);
  await db.query("insert into asignatura(id,nombre,codigo,activo) values($1,'Asignatura actual',$2,false),($3,'Asignatura ajena',$4,true)",[subject,randomUUID(),foreignSubject,randomUUID()]);
  await db.query('insert into campus_carrera values($1,$2),($3,$4)',[campus,career,otherCampus,foreignCareer]);
  await db.query('insert into carrera_asignatura values($1,$2,1),($3,$4,1)',[career,subject,foreignCareer,foreignSubject]);
  const id=await seedAudit(actor,user,campus,{careers:[{id:career},{id:foreignCareer}],subjects:[{id:subject},{id:foreignSubject}]});
  const result=await auditDetail(id);
  assert.equal(result.references['datos_antes.careers.0.id'].name,'Carrera actual');
  assert.equal(result.references['datos_antes.subjects.0.id'].name,'Asignatura actual');
  assert.equal(result.references['datos_antes.careers.1.id'].name,null);assert.equal(result.references['datos_antes.subjects.1.id'].name,null);
});

test('audit list and detail distinguish ordinary, explicitly permitted, authorized-role-only and administrator actors', async () => {
  const {actor:viewer}=await fixture();
  const ordinary=await profile(campus,'Carlos común'),permitted=await profile(campus,'Camila con permisos'),authorized=await profile(campus,'María autorizada'),permissionOnly=await profile(campus,'Permiso sin rol');
  await db.query("update perfil_usuario set created_at='2026-01-01' where id=any($1::uuid[])",[[viewer,ordinary,permitted,authorized,permissionOnly]]);
  await db.query("update usuario_rol set asignado_en='2026-01-01' where perfil_usuario_id=$1",[viewer]);
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id,asignado_en) values($1,$2,$3,'2026-01-01'),($4,$2,$3,'2026-01-01')",[permitted,roles.USUARIO_AUTORIZADO,campus,authorized]);
  await db.query("insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id,otorgado_en) values($1,$2,$3,'2026-01-01')",[permitted,permissions.PUBLICAR_EVENTO,campus]);
  await db.query("insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id,otorgado_en) values($1,$2,$3,'2026-01-01')",[permissionOnly,permissions.ACCEDER_REPORTERIA,campus]);
  const ids=[];
  for(const responsible of [ordinary,permitted,authorized,viewer,permissionOnly]) ids.push(await seedAudit(responsible,randomUUID()));
  await db.query("update auditoria set accion='PUBLICAR_PUBLICACION',entidad_tipo='publicacion_recurso',created_at='2026-10-27T10:00:00.123456Z' where id=any($1::uuid[])",[ids]);
  const list=(await (await request(auditRoute()+'?action=PUBLICAR_PUBLICACION&limit=100')).json()).data;
  for(const [index,kind] of ['user','authorized','authorized','administrator','authorized'].entries()) {
    const item=list.find((row:{id:string})=>row.id===ids[index]);assert.ok(item);
    const detail=await auditDetail(ids[index]);assert.deepEqual(item.actor,detail.actor);
    assert.equal(item.actor.kind,kind);assert.equal(item.actor.source,'assignment_history');
  }
  assert.equal((await auditDetail(ids[0])).actor.name,'Carlos común');
  assert.deepEqual((await auditDetail(ids[1])).actor.permissions,['PUBLICAR_EVENTO']);
  assert.deepEqual((await auditDetail(ids[2])).actor.permissions,[]);
  assert.deepEqual((await auditDetail(ids[4])).actor.roles,[]);
  assert.deepEqual((await auditDetail(ids[4])).actor.permissions,['ACCEDER_REPORTERIA']);
});

test('audit actor classification uses historical grants with exact microseconds, not later or current privileges', async () => {
  await fixture();const responsible=await profile(campus,'Histórico');
  await db.query("update perfil_usuario set created_at='2026-01-01' where id=$1",[responsible]);
  await db.query(`insert into usuario_rol(perfil_usuario_id,rol_id,campus_id,asignado_en,revocado_en) values
    ($1,$2,$3,'2026-10-09T10:00:00.123457Z','2026-10-09T10:00:00.123459Z'),
    ($1,$4,$3,'2026-10-09T10:00:00.123459Z','2026-10-09T10:00:00.123460Z'),
    ($1,$4,$3,'2026-10-20T10:00:00Z',null)`,[responsible,roles.USUARIO_AUTORIZADO,campus,roles.ADMINISTRADOR]);
  await db.query(`insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id,otorgado_en,revocado_en)
    values($1,$2,$3,'2026-10-09T10:00:00.123457Z','2026-10-09T10:00:00.123458Z')`,[responsible,permissions.PUBLICAR_EVENTO,campus]);
  const expected=['user','authorized','authorized','administrator','user'],ids=[];
  for(let index=0;index<5;index++) {
    const id=await seedAudit(responsible,randomUUID());ids.push(id);
    await db.query("update auditoria set accion='PUBLICAR_PUBLICACION',created_at=$2::timestamptz where id=$1",[id,'2026-10-09T10:00:00.'+String(123456+index)+'Z']);
    const detail=await auditDetail(id);assert.equal(detail.actor.kind,expected[index],detail.created_at);
    assert.equal(detail.actor.permissions.length,index===1?1:0);
  }
  const before=(await db.query('select * from auditoria where id=any($1::uuid[]) order by id',[ids])).rows;
  // Traslado y desactivación posteriores no sustituyen la categoría histórica ni exponen nombre de otra sede.
  await db.query("update perfil_usuario set campus_id=$2,deleted_at=now(),estado_cuenta='DESACTIVADA' where id=$1",[responsible,otherCampus]);
  for(const [index,id] of ids.entries()) {const result=await auditDetail(id);assert.equal(result.actor.kind,expected[index]);assert.equal(result.actor.name,null);}
  assert.deepEqual((await db.query('select * from auditoria where id=any($1::uuid[]) order by id',[ids])).rows,before);
});

test('audit actors ignore grants in another campus and remain neutral for missing or inconsistent historical identities', async () => {
  await fixture();const responsible=await profile(),foreignInstitution=randomUUID(),wrongInstitution=await profile();
  await db.query("update perfil_usuario set created_at='2026-01-01' where id=any($1::uuid[])",[[responsible,wrongInstitution]]);
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id,asignado_en) values($1,$2,$3,'2026-01-01')",[responsible,roles.ADMINISTRADOR,otherCampus]);
  await db.query("insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id,otorgado_en) values($1,$2,$3,'2026-01-01')",[responsible,permissions.PUBLICAR_EVENTO,otherCampus]);
  await db.query("insert into institucion(id,nombre) values($1,'Foreign private institution')",[foreignInstitution]);
  await db.query('update perfil_usuario set institucion_id=$2 where id=$1',[wrongInstitution,foreignInstitution]);
  const local=await seedAudit(responsible,randomUUID()),absent=await seedAudit(null,randomUUID()),wrong=await seedAudit(wrongInstitution,randomUUID());
  assert.equal((await auditDetail(local)).actor.kind,'user');
  for(const id of [absent,wrong]) assert.deepEqual((await auditDetail(id)).actor,{kind:'unknown',source:'unavailable',name:null,roles:[],permissions:[]});
  const beforeExistence=await seedAudit(responsible,randomUUID());
  await db.query("update auditoria set created_at='2025-01-01' where id=$1",[beforeExistence]);
  assert.equal((await auditDetail(beforeExistence)).actor.source,'unavailable');
  const legacyRole=randomUUID();
  await db.query("insert into rol(id,nombre) values($1,'LEGACY_UNKNOWN_ROLE')",[legacyRole]);
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id,asignado_en) values($1,$2,$3,'2026-01-01')",[responsible,legacyRole,campus]);
  assert.equal((await auditDetail(local)).actor.kind,'unknown');
});

function auditActivity(owner: string, at = campus, patch: Partial<ActivityDocument> = {}): ActivityDocument {
  return { _id:new ObjectId(),campusId:at,createdByUserId:owner,title:'Actividad conservada',description:'Descripción de actividad',type:'COMMUNITY_ACTIVITY',
    status:'ACTIVE',visibility:'PUBLIC',startAt:new Date('2026-10-28T12:00:00Z'),endAt:new Date('2026-10-28T13:00:00Z'),location:{buildingKey:'h',floorKey:'1'},
    participantCount:1,createdAt:new Date('2026-10-27T12:00:00Z'),updatedAt:new Date('2026-10-27T12:00:00Z'),...patch };
}

test('administrative timeline merges Mongo activities and SQL actions before pagination and date filtering', async () => {
  const {actor,user}=await fixture(),scoped=randomUUID();
  await db.query("insert into campus(id,institucion_id,nombre) values ($1,$2,'Unified history')",[scoped,institution]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)',[actor,roles.ADMINISTRADOR,scoped]);
  const pgIds=[];
  for(const stamp of ['2026-10-27T12:00:00.000001Z','2026-10-27T11:00:00.000000Z']) {
    const id=await seedAudit(actor,user,scoped);pgIds.push(id);await db.query('update auditoria set created_at=$2::timestamptz where id=$1',[id,stamp]);
  }
  const {activityAuditEntry,activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js');
  const value=auditActivity(user,scoped);
  const row=activityAuditEntry({id:activityAuditId(value._id,'created'),activityId:value._id,at:value.createdAt,actor:user,type:value.type,kind:'created',name:value.title},
    {id:scoped,institucion_id:institution,nombre:'Unified history',activo:true});
  mongoEntries=[row,{...row,id:row.id.replace('created','deleted'),accion:'ELIMINAR_ACTIVIDAD',created_at:'2026-10-27T10:00:00.000Z'},
    {...row,campus_id:otherCampus,id:'foreign'}];
  const one=await (await request(auditRoute(undefined,scoped)+'?limit=2')).json();
  assert.deepEqual(one.data.map((item:{id:string})=>item.id),[pgIds[0],row.id]);assert.equal(one.meta.hasMore,true);
  assert.equal(one.meta.total,4,'Total merges both scoped sources, excluding foreign campus');
  const two=await (await request(auditRoute(undefined,scoped)+'?limit=2&page=2')).json();
  assert.deepEqual(two.data.map((item:{id:string})=>item.id),[pgIds[1],mongoEntries[1].id]);assert.equal(two.meta.hasMore,false);
  assert.ok(one.data.every((item:object)=>!Object.hasOwn(item,'datos_despues')));
  const bounds=new URLSearchParams({from:'2026-10-27T12:00:00.000Z',before:'2026-10-27T13:00:00.000Z'});
  const filtered=await (await request(auditRoute(undefined,scoped)+'?'+bounds)).json();
  assert.deepEqual(filtered.data.map((item:{id:string})=>item.id),[pgIds[0],row.id]);
  assert.equal(filtered.meta.total,2);
  const action=await (await request(auditRoute(undefined,scoped)+'?action=CREAR_ACTIVIDAD')).json();assert.deepEqual(action.data.map((item:{id:string})=>item.id),[row.id]);
  assert.equal(action.meta.total,1);
});

test('Mongo audit detail preserves activity changes, names/IDs and actor type after logical deletion', async () => {
  const {user}=await fixture();await db.query("update perfil_usuario set created_at='2026-01-01',nombre_completo='Organizador' where id=$1",[user]);
  const value=auditActivity(user, campus,{type:'OFFICIAL_EVENT',status:'DELETED',visibility:'HIDDEN',deletedAt:new Date('2026-10-27T14:00:00Z'),deletedByUserId:user});
  const before={title:'Título inicial',description:'Texto inicial',type:value.type,status:'ACTIVE',startAt:value.startAt,endAt:value.endAt,location:value.location};
  const change={_id:new ObjectId(),operationId:new ObjectId(),activityId:value._id,campusId:campus,actorUserId:user,revision:1,scope:'ONE' as const,
    changedAt:new Date('2026-10-27T13:00:00Z'),before,after:{...before,title:'Título editado'},changedFields:['title'],notificationReasons:[]};
  value.changeHistory=[change,{...change,_id:new ObjectId(),revision:2,changedAt:value.deletedAt!,before:change.after,after:{...change.after,status:'DELETED',deletedAt:value.deletedAt!},changedFields:['status','deletedAt']}];
  mongoDocuments=[value];
  const {activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js');
  const creation=await auditDetail(activityAuditId(value._id,'created'));
  assert.equal(creation.accion,'PUBLICAR_EVENTO_OFICIAL');assert.equal(creation.activity.snapshotSource,'first_change');
  assert.equal(creation.datos_despues.titulo,'Título inicial');assert.equal(creation.actor.kind,'user');assert.equal(creation.actor.name,'Organizador');
  assert.deepEqual(creation.responsibleProfile,{fullName:'Organizador',email:null,careers:[]});
  assert.equal(creation.references.entidad_id.name,'Título inicial');assert.equal(creation.references.entidad_id.id,value._id.toHexString());
  assert.equal(creation.references['datos_despues.propietario_id'].name,'Organizador');assert.ok(creation.references.campus_id.name);
  const edited=await auditDetail(activityAuditId(value._id,'change:'+change._id.toHexString()));
  assert.equal(edited.accion,'EDITAR_EVENTO_OFICIAL');assert.equal(edited.datos_antes.titulo,'Título inicial');assert.equal(edited.datos_despues.titulo,'Título editado');
  const removed=await auditDetail(activityAuditId(value._id,'change:'+value.changeHistory[1]._id.toHexString()));
  assert.equal(removed.accion,'ELIMINAR_EVENTO_OFICIAL');assert.equal(removed.datos_despues.estado_actividad,'DELETED');
  assert.equal((await request(auditRoute(activityAuditId(value._id,'deleted')))).status,404,'No duplicate legacy deletion when change exists');
  value.changeHistory=[];
  const current=await auditDetail(activityAuditId(value._id,'created'));assert.equal(current.activity.snapshotSource,'current');assert.equal(current.references.entidad_id.source,'current');
});

test('activity audit location details return scoped building/floor/POI names and full IDs on both sides without changing snapshots', async () => {
  const {user}=await fixture();const value=auditActivity(user);
  const before={title:'Original',description:value.description,type:value.type,startAt:value.startAt,endAt:value.endAt,location:{buildingKey:'h',floorKey:'1',poiKey:'sala'}};
  const after={...before,location:{buildingKey:'b',floorKey:'1',poiKey:'sala'}};
  const change={_id:new ObjectId(),operationId:new ObjectId(),activityId:value._id,campusId:campus,actorUserId:user,revision:1,scope:'ONE' as const,
    changedAt:new Date('2026-10-27T13:00:00Z'),before,after,changedFields:['location'],notificationReasons:[]};
  value.changeHistory=[change];mongoDocuments=[value];
  mongoMap={_id:new ObjectId(),campusId:campus,status:'ACTIVE',version:1,createdAt:value.createdAt,updatedAt:value.updatedAt,buildings:[
    {id:'h',name:'Edificio H',isVisible:false,floors:[{id:'1',name:'Primer piso H',deletedAt:new Date(),pois:[{poiKey:'sala',name:'Sala H',isVisible:false}]}]},
    {id:'b',name:'Edificio B',floors:[{id:'1',name:'Primer piso B',pois:[{poiKey:'sala',name:'Sala B'}]}]},
  ]};
  const {activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js');
  const id=activityAuditId(value._id,'change:'+change._id.toHexString()),original=JSON.stringify(value);
  const result=await auditDetail(id);
  for(const [side,building,floor,poi] of [['datos_antes','Edificio H','Primer piso H','Sala H'],['datos_despues','Edificio B','Primer piso B','Sala B']]) {
    for(const [field,name] of [['edificio_clave',building],['piso_clave',floor],['poi_clave',poi]]) {
      const ref=result.references[side+'.ubicacion.'+field];assert.equal(ref.name,name);assert.equal(ref.source,'current');assert.equal(ref.id,result[side].ubicacion[field]);
    }
  }
  assert.equal(JSON.stringify(value),original);const snapshots=[result.datos_antes,result.datos_despues];
  mongoMap={...mongoMap,campusId:otherCampus};
  const foreign=await auditDetail(id);assert.deepEqual([foreign.datos_antes,foreign.datos_despues],snapshots);
  assert.equal(foreign.references['datos_despues.ubicacion.poi_clave'].name,null);
  mongoMap=null;const absent=await auditDetail(id);assert.equal(absent.references['datos_antes.ubicacion.piso_clave'].id,'1');
  assert.equal(absent.references['datos_antes.ubicacion.piso_clave'].source,'unavailable');
});

test('administrative participation is paginated, preserves repeat transitions and limits names to authorized campus/institution', async () => {
  const {user}=await fixture(),outside=await profile(otherCampus,'PRIVATE OTHER CAMPUS');
  const value=auditActivity(user,campus,{status:'DELETED',deletedAt:new Date('2026-10-28')});mongoDocuments=[value];
  const {activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js');
  const id=activityAuditId(value._id,'created'),path=auditRoute(id)+'/participation';
  participationEvents=[{id:'event3',userId:user,type:'JOINED',occurredAt:'2026-10-27T15:00:00Z',provenance:'LIVE'},
    {id:'event2',userId:user,type:'LEFT',occurredAt:'2026-10-27T14:00:00Z',provenance:'LIVE'},
    {id:'event1',userId:outside,type:'JOINED',occurredAt:'2026-10-27T13:00:00Z',provenance:'LEGACY_STATE'}];
  const first=await request(path+'?limit=2');assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');
  const one=await first.json();assert.deepEqual(one.data.events.map((row:{type:string})=>row.type),['JOINED','LEFT']);assert.equal(one.meta.hasMore,true);
  assert.equal(one.data.events[0].userId,user);assert.equal(one.data.events[0].name,'User');assert.equal(one.data.summary.historyIncomplete,true);
  const two=await (await request(path+'?limit=2&page=2')).json();assert.equal(two.data.events[0].name,null);assert.equal(two.meta.hasMore,false);
  assert.doesNotMatch(JSON.stringify(two),/PRIVATE OTHER CAMPUS|email|eventKey/);
  for(const query of ['page=0','limit=101','page=1&page=2'])assert.equal((await request(path+'?'+query)).status,400);
  assert.equal((await request(auditRoute(id,otherCampus)+'/participation')).status,403);
  assert.equal((await request(auditRoute(activityAuditId(new ObjectId(),'created'))+'/participation')).status,404);
  assert.equal((await request(auditRoute(activityAuditId(value._id,'deleted'))+'/participation')).status,404);
});

test('Mongo audit and participation authorize before Mongo reads and do not silently omit unavailable history', async () => {
  const {actor,user}=await fixture(),id='activity:'+new ObjectId().toHexString()+':created';
  authUser=user;mongoReads=0;
  for(const path of [auditRoute(),auditRoute(id),auditRoute(id)+'/participation'])assert.equal((await request(path)).status,403);
  assert.equal(mongoReads,0);
  authUser=actor;mongoFailure=true;
  for(const path of [auditRoute(),auditRoute(id),auditRoute(id)+'/participation']) {
    const response=await request(path);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private MongoDB secret/);
  }
  assert.equal((await request(auditRoute()+'?action=ASIGNAR_ROL')).status,200,'Explicit SQL-only filter does not need Mongo');
});

test('recurring audit creation opens every occurrence with independent snapshots, IDs and participation, including past/hidden/deleted entries',async()=>{
  const {actor,user}=await fixture(),seriesId=new ObjectId();
  const {activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js');
  const values=Array.from({length:12},(_,index)=>auditActivity(user,campus,{seriesId,occurrenceIndex:index+1,type:'OFFICIAL_EVENT',
    title:'Fecha '+(index+1),status:index===0?'DELETED':index===1?'FINISHED':'ACTIVE',visibility:index===0?'HIDDEN':'PUBLIC',
    startAt:new Date(Date.UTC(2026,9,1+index,12)),endAt:new Date(Date.UTC(2026,9,1+index,13))}));
  mongoDocuments=[...values,auditActivity(user,otherCampus,{seriesId}),auditActivity(actor,campus,{seriesId,type:'OFFICIAL_EVENT'}),
    auditActivity(user,campus,{seriesId,type:'COMMUNITY_ACTIVITY'}),auditActivity(user,campus,{seriesId,type:'OFFICIAL_EVENT',createdAt:new Date('2026-10-27T12:00:00.001Z')})];
  const original=JSON.stringify(mongoDocuments),anchor=activityAuditId(values[11]._id,'created'),path=auditRoute(anchor)+'/occurrences';
  const first=await request(path+'?limit=5');assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');
  const one=await first.json();assert.equal(one.data.seriesId,seriesId.toHexString());assert.equal(one.data.occurrences.length,5);assert.equal(one.meta.hasMore,true);
  assert.equal(one.data.occurrences[0].status,'DELETED');assert.equal(one.data.occurrences[0].visibility,'HIDDEN');
  const all=[...one.data.occurrences];
  for(const page of [2,3]){const result=await (await request(path+`?limit=5&page=${page}`)).json();all.push(...result.data.occurrences);assert.equal(result.meta.hasMore,page===2);}
  assert.deepEqual(all.map(row=>row.activityId),values.map(row=>row._id.toHexString()));
  for(const [index,value] of values.entries()){
    const detail=await auditDetail(activityAuditId(value._id,'created'));assert.equal(detail.id,all[index].auditId);
    assert.deepEqual(detail.activitySeries,{seriesId:seriesId.toHexString(),count:12});assert.equal(detail.datos_despues.id,value._id.toHexString());
    assert.equal(detail.datos_despues.inicio_en,value.startAt.toISOString());assert.equal(detail.activity.snapshotSource,'current');
  }
  participationEvents=[{id:'only-this-occurrence',userId:user,type:'JOINED',occurredAt:'2026-10-27T15:00:00Z',provenance:'LIVE'}];
  const joined=await (await request(auditRoute(all[0].auditId)+'/participation')).json();assert.equal(joined.data.activityId,values[0]._id.toHexString());
  assert.equal(joined.data.events.length,1);assert.equal(JSON.stringify(mongoDocuments),original);
  for(const query of ['limit=101','page=0','page=1&page=2'])assert.equal((await request(path+'?'+query)).status,400);
  const standalone=auditActivity(user);mongoDocuments.push(standalone);
  assert.equal((await request(auditRoute(activityAuditId(standalone._id,'created'))+'/occurrences')).status,404);
  assert.equal((await request(auditRoute(activityAuditId(values[0]._id,'deleted'))+'/occurrences')).status,404);
  assert.equal((await request(auditRoute(randomUUID())+'/occurrences')).status,404);
});

test('administrative occurrences recheck campus/admin/account before Mongo and sanitize dependency failures',async()=>{
  const {actor,user}=await fixture(),value=auditActivity(user,campus,{seriesId:new ObjectId()});mongoDocuments=[value];
  const {activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js');
  const path=auditRoute(activityAuditId(value._id,'created'))+'/occurrences';
  const before=mongoReads;
  assert.equal((await request(path,undefined,'')).status,401);
  authUser=user;assert.equal((await request(path)).status,403);assert.equal(mongoReads,before);authUser=actor;
  assert.equal((await request(auditRoute(activityAuditId(value._id,'created'),otherCampus)+'/occurrences')).status,403);assert.equal(mongoReads,before);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values($1,$2,$3)',[actor,roles.ADMINISTRADOR,otherCampus]);
  assert.equal((await request(auditRoute(activityAuditId(value._id,'created'),otherCampus)+'/occurrences')).status,404);
  mongoFailure=true;
  const failed=await request(path);assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private|secret|MongoDB/);mongoFailure=false;
  const reads=mongoReads;
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]).then(()=>{});
  assert.equal((await request(path)).status,403);assert.equal(mongoReads,reads);
});

test('responsible registered profile is detail-only with Auth email and every associated same-institution career', async () => {
  const {user}=await fixture();const a=randomUUID(),b=randomUUID(),foreign=randomUUID(),otherInstitution=randomUUID();
  await db.query("update perfil_usuario set nombre_completo='Carlos Andrés Soto González' where id=$1",[user]);
  await db.query("update auth.users set email='carlos.soto@duocuc.cl',encrypted_password='NEVER EXPOSE AUTH HASH' where id=$1",[user]);
  await db.query("insert into institucion(id,nombre) values($1,'Foreign')",[otherInstitution]);
  await db.query("insert into carrera(id,institucion_id,nombre,activo) values($1,$4,'Analista Programador',true),($2,$4,'Ingeniería en Informática',false),($3,$5,'FOREIGN CAREER PRIVATE',true)",[a,b,foreign,institution,otherInstitution]);
  for(const career of [b,a,foreign])await db.query('insert into usuario_carrera(perfil_usuario_id,carrera_id) values($1,$2)',[user,career]);
  const id=await seedAudit(user,randomUUID());const original=(await db.query('select * from auditoria where id=$1',[id])).rows[0];
  const record=await auditDetail(id);
  assert.deepEqual(record.responsibleProfile,{fullName:'Carlos Andrés Soto González',email:'carlos.soto@duocuc.cl',careers:[{id:a,name:'Analista Programador'},{id:b,name:'Ingeniería en Informática'}]});
  assert.doesNotMatch(JSON.stringify(record),/NEVER EXPOSE AUTH HASH|encrypted_password|FOREIGN CAREER PRIVATE/);
  const listed=await (await request(auditRoute()+'?limit=100')).json();
  assert.ok(listed.data.every((row:object)=>!Object.hasOwn(row,'responsibleProfile')));assert.doesNotMatch(JSON.stringify(listed),/carlos.soto@duocuc.cl|Ingeniería en Informática/);
  await db.query("update auth.users set email='nuevo@duocuc.cl' where id=$1",[user]);
  await db.query("update carrera set nombre='Carrera renombrada' where id=$1",[a]);
  const current=await auditDetail(id);assert.equal(current.responsibleProfile.email,'nuevo@duocuc.cl');assert.ok(current.responsibleProfile.careers.some((career:{name:string})=>career.name==='Carrera renombrada'));
  assert.deepEqual((await db.query('select * from auditoria where id=$1',[id])).rows[0],original);
});

test('responsible profile retains inactive local identities but withholds PII outside campus/institution and handles missing fields', async () => {
  const {user}=await fixture();const id=await seedAudit(user,randomUUID());
  let record=await auditDetail(id);assert.deepEqual(record.responsibleProfile,{fullName:'User',email:null,careers:[]});
  await db.query("update auth.users set email='PRIVATE CONTACT@duocuc.cl' where id=$1",[user]);
  await db.query("update perfil_usuario set estado_cuenta='DESACTIVADA',deleted_at=now(),nombre_completo='PRIVATE LOCAL NAME' where id=$1",[user]);
  record=await auditDetail(id);assert.equal(record.responsibleProfile.fullName,'PRIVATE LOCAL NAME');assert.equal(record.responsibleProfile.email,'PRIVATE CONTACT@duocuc.cl');
  await db.query('update perfil_usuario set campus_id=$2 where id=$1',[user,otherCampus]);
  record=await auditDetail(id);assert.equal(record.responsibleProfile,null);assert.doesNotMatch(JSON.stringify(record),/PRIVATE CONTACT|PRIVATE LOCAL NAME/);
  const otherInstitution=randomUUID();await db.query("insert into institucion(id,nombre) values($1,'Foreign contact institution')",[otherInstitution]);
  await db.query('update perfil_usuario set campus_id=$2,institucion_id=$3 where id=$1',[user,campus,otherInstitution]);
  record=await auditDetail(id);assert.equal(record.responsibleProfile,null);assert.doesNotMatch(JSON.stringify(record),/PRIVATE CONTACT|PRIVATE LOCAL NAME/);
  const absent=await seedAudit(null,randomUUID());assert.equal((await auditDetail(absent)).responsibleProfile,null);
});

async function auditImageFixture() {
  const {actor,user}=await fixture(),publicationId=await publication(user),imageId=randomUUID(),nextId=randomUUID();
  const storagePath=`${campus}/${user}/${publicationId}/${imageId}.png`;
  await db.query(`insert into archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo)
    values($1,$2,'publication-images',$3,'Original.png','image/png',2048,'IMAGEN')`,[imageId,publicationId,storagePath]);
  const before={id:publicationId,images:[{id:imageId,nombre_original:'Nombre histórico.png',mime_type:'image/png',tamano_bytes:2048,orden:0,deleted_at:null}]};
  const after={id:publicationId,images:[{id:nextId,nombre_original:'Siguiente.webp',mime_type:'image/webp',tamano_bytes:1024,orden:0,deleted_at:null}]};
  const auditId=await seedAudit(actor,publicationId,campus,before,after);
  await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion='EDITAR_PUBLICACION' where id=$1",[auditId]);
  return {actor,user,publicationId,imageId,nextId,storagePath,auditId,before,after};
}
const imageRoute=(auditId:string,imageId:string,at=campus)=>auditRoute(auditId,at)+'/images/'+imageId;

test('audit images sign only recorded IDs on demand and retain historical metadata after image/publication retirement',async()=>{
  const f=await auditImageFixture();
  await db.query("update archivo_publicacion set deleted_at=now(),nombre_original='Renamed current.png' where id=$1",[f.imageId]);
  await db.query("update publicacion_recurso set deleted_at=now(),estado_publicacion='OCULTO' where id=$1",[f.publicationId]);
  const detail=await auditDetail(f.auditId);assert.deepEqual(detail.datos_antes,f.before);assert.deepEqual(detail.datos_despues,f.after);assert.equal(imageSigns.length,0);
  const response=await request(imageRoute(f.auditId,f.imageId));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual((await response.json()).data,{url:'https://private-preview.invalid/image-1',expiresIn:60});assert.deepEqual(imageSigns,[f.storagePath]);
  const serialized=JSON.stringify(await auditDetail(f.auditId));assert.doesNotMatch(serialized,/storage_path|signed|private-preview|Renamed current/);
  const again=await request(imageRoute(f.auditId,f.imageId));assert.equal(again.status,200);assert.equal(imageSigns.length,2,'New request renews signature');
  assert.deepEqual((await db.query('select datos_antes,datos_despues from auditoria where id=$1',[f.auditId])).rows[0],{datos_antes:f.before,datos_despues:f.after});
});

test('audit images reject unrecorded, foreign, wrong-kind and unsafe stored files before signing',async()=>{
  const f=await auditImageFixture(),unrecorded=randomUUID();
  await db.query(`insert into archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo)
    values($1,$2,'publication-images',$3,'Current.png','image/png',100,'IMAGEN')`,[unrecorded,f.publicationId,`${campus}/current.png`]);
  assert.equal((await request(imageRoute(f.auditId,unrecorded))).status,404);
  assert.equal((await request(imageRoute(f.auditId,f.nextId))).status,404,'Recorded ID without retained file');
  const foreign=await publication(f.user,'FISICO','DISPONIBLE',otherCampus);
  await db.query('update archivo_publicacion set publicacion_id=$1 where id=$2',[foreign,f.imageId]);
  assert.equal((await request(imageRoute(f.auditId,f.imageId))).status,404);
  await db.query('update archivo_publicacion set publicacion_id=$1 where id=$2',[f.publicationId,f.imageId]);
  for(const [column,value] of [['bucket_id','private-digital'],['storage_path',`${otherCampus}/secret.png`],['storage_path',`${campus}/../secret.png`],['mime_type','application/pdf'],['tipo_archivo','RECURSO']]){
    await db.query(`update archivo_publicacion set ${column}=$1 where id=$2`,[value,f.imageId]);
    assert.equal((await request(imageRoute(f.auditId,f.imageId))).status,404,column);
    await db.query("update archivo_publicacion set bucket_id='publication-images',storage_path=$1,mime_type='image/png',tipo_archivo='IMAGEN' where id=$2",[f.storagePath,f.imageId]);
  }
  await db.query("update publicacion_recurso set tipo_recurso='DIGITAL' where id=$1",[f.publicationId]);assert.equal((await request(imageRoute(f.auditId,f.imageId))).status,404);
  await db.query("update publicacion_recurso set tipo_recurso='FISICO',campus_id=$1 where id=$2",[otherCampus,f.publicationId]);assert.equal((await request(imageRoute(f.auditId,f.imageId))).status,404);
  await db.query('update publicacion_recurso set campus_id=$1 where id=$2',[campus,f.publicationId]);
  await db.query("update auditoria set entidad_tipo='perfil_usuario' where id=$1",[f.auditId]);assert.equal((await request(imageRoute(f.auditId,f.imageId))).status,404);
  assert.equal(imageSigns.length,0);
});

test('audit images reauthorize account/admin/campus and sanitize Storage failures without breaking audit detail',async()=>{
  const f=await auditImageFixture(),path=imageRoute(f.auditId,f.imageId);
  assert.equal((await request(path,undefined,'')).status,401);assert.equal((await request(imageRoute(f.auditId,f.imageId,otherCampus))).status,403);
  authUser=f.user;assert.equal((await request(path)).status,403);authUser=f.actor;
  const foreignAudit=await seedAudit(f.actor,f.publicationId,otherCampus);assert.equal((await request(imageRoute(foreignAudit,f.imageId))).status,404);
  assert.equal((await request(imageRoute('invalid',f.imageId))).status,400);assert.equal((await request(imageRoute(f.auditId,'invalid'))).status,400);
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[f.actor]).then(()=>{});
  assert.equal((await request(path)).status,403);await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1',[f.actor]);
  beforeTransaction=()=>db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[f.actor]).then(()=>{});
  assert.equal((await request(path)).status,403);await db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1",[f.actor]);
  beforeTransaction=()=>db.query('update campus set activo=false where id=$1',[campus]).then(()=>{});
  try { assert.equal((await request(path)).status,403); } finally { await db.query('update campus set activo=true where id=$1',[campus]); }
  assert.equal(imageSigns.length,0);imageFailure=true;
  const failure=await request(path);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private|Storage|service key|path|token/);
  assert.equal((await request(auditRoute(f.auditId))).status,200);imageFailure=false;
  const recovered=await request(path);assert.equal(recovered.status,200);
});

async function accessGroupFixture() {
  const {actor}=await fixture(),scoped=randomUUID();
  await db.query("insert into campus(id,institucion_id,nombre) values($1,$2,'Grouped access history')",[scoped,institution]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values($1,$2,$3)',[actor,roles.ADMINISTRADOR,scoped]);
  return {actor,scoped,user:await profile(scoped)};
}
async function seedAccessOperation(actor:string,user:string,scoped:string,stamp:string,actions=['ASIGNAR_ROL','ASIGNAR_PERMISO'],variant='') {
  const before={roles:[],permissions:[]},after={roles:[{id:randomUUID(),catalog_id:roles.USUARIO_AUTORIZADO,nombre:'USUARIO_AUTORIZADO',campus_id:scoped}],
    permissions:[{id:randomUUID(),catalog_id:permissions.PUBLICAR_EVENTO,nombre:'PUBLICAR_EVENTO',campus_id:scoped}],...(variant?{nombre_completo:variant}:{})};
  const ids:string[]=[];
  for(const action of actions){
    const change={action,assignmentId:randomUUID(),catalogId:action.includes('ROL')?roles.USUARIO_AUTORIZADO:permissions.PUBLICAR_EVENTO};
    const id=await seedAudit(actor,user,scoped,{...before,...change},{...after,...change});ids.push(id);
    await db.query('update auditoria set accion=$1,created_at=$2::timestamptz where id=$3',[action,stamp,id]);
  }
  return {ids:ids.sort().reverse(),before,after};
}

test('publication owner detail remains distinct from action actor with scoped registered profile and permissions at original microsecond',async()=>{
  const {actor,user}=await fixture(),career=randomUUID(),publicationId=await publication(user);
  await db.query("update perfil_usuario set created_at='2026-01-01' where id=any($1::uuid[])",[[actor,user]]);
  await db.query("update usuario_rol set asignado_en='2026-01-01' where perfil_usuario_id=$1",[actor]);
  await db.query("update auth.users set email=case when id=$1 then 'owner@duocuc.cl' else 'admin@duocuc.cl' end where id=any($2::uuid[])",[user,[actor,user]]);
  await db.query("insert into carrera(id,institucion_id,nombre) values($1,$2,'Informática')",[career,institution]);await db.query('insert into usuario_carrera values($1,$2)',[user,career]);
  await db.query("insert into usuario_rol(perfil_usuario_id,rol_id,campus_id,asignado_en) values($1,$2,$3,'2026-01-01')",[user,roles.USUARIO_AUTORIZADO,campus]);
  await db.query(`insert into usuario_permiso(perfil_usuario_id,permiso_id,campus_id,otorgado_en,revocado_en) values
    ($1,$2,$5,'2026-01-01',null),($1,$3,$5,'2026-01-01','2026-10-27T12:00:00.123457Z'),($1,$4,$5,'2026-10-27T12:00:00.123457Z',null)`,
    [user,permissions.PUBLICAR_EVENTO,permissions.ACCEDER_ANALITICA,permissions.ACCEDER_REPORTERIA,campus]);
  const before={id:publicationId,propietario_id:user,campus_id:campus,titulo:'Original'},after={...before,titulo:'Nuevo'};
  const id=await seedAudit(actor,publicationId,campus,before,after);
  await db.query("update auditoria set accion='EDITAR_PUBLICACION',entidad_tipo='publicacion_recurso',created_at='2026-10-27T12:00:00.123456Z' where id=$1",[id]);
  const record=await auditDetail(id),owner=record.publicationOwners[user];
  assert.equal(record.responsibleProfile.email,'admin@duocuc.cl');assert.equal(owner.profile.email,'owner@duocuc.cl');
  assert.deepEqual(owner.profile.careers,[{id:career,name:'Informática'}]);assert.equal(owner.assignments.kind,'authorized');
  assert.deepEqual(owner.assignments.permissions,['ACCEDER_ANALITICA','PUBLICAR_EVENTO']);assert.deepEqual(record.datos_antes,before);assert.deepEqual(record.datos_despues,after);
  const list=await (await request(auditRoute()+'?action=EDITAR_PUBLICACION&limit=100')).json();
  assert.ok(list.data.every((row:any)=>!Object.hasOwn(row,'publicationOwners')));assert.doesNotMatch(JSON.stringify(list),/owner@duocuc/);
  await db.query("update perfil_usuario set estado_cuenta='DESACTIVADA',deleted_at=now() where id=$1",[user]);
  assert.equal((await auditDetail(id)).publicationOwners[user].profile.email,'owner@duocuc.cl');
  assert.deepEqual((await db.query('select datos_antes,datos_despues from auditoria where id=$1',[id])).rows[0],{datos_antes:before,datos_despues:after});
});

test('publication owner metadata withholds foreign-campus/institution/future/missing PII and never substitutes the responsible profile',async()=>{
  const {actor,user}=await fixture(),foreign=await profile(otherCampus,'PRIVATE OWNER'),wrongInstitution=await profile(campus,'FOREIGN INSTITUTION OWNER'),future=await profile(campus,'FUTURE OWNER');
  await db.query("update perfil_usuario set created_at='2026-01-01' where id=any($1::uuid[])",[[actor,user,foreign,wrongInstitution]]);
  const otherInstitution=randomUUID();await db.query("insert into institucion(id,nombre) values($1,'Other owner institution')",[otherInstitution]);
  await db.query('update perfil_usuario set institucion_id=$2 where id=$1',[wrongInstitution,otherInstitution]);
  await db.query("update perfil_usuario set created_at='2026-10-28' where id=$1",[future]);
  const id=await seedAudit(actor,randomUUID(),campus,null,{propietario_id:user});
  await db.query("update auditoria set accion='PUBLICAR_PUBLICACION',entidad_tipo='publicacion_recurso',created_at='2026-10-27T12:00:00.123456Z' where id=$1",[id]);
  for(const ownerId of [foreign,wrongInstitution,future,randomUUID()]){
    await db.query('update auditoria set datos_despues=$1::jsonb where id=$2',[JSON.stringify({propietario_id:ownerId}),id]);
    const record=await auditDetail(id);assert.equal(record.publicationOwners[ownerId].profile,null);assert.equal(record.publicationOwners[ownerId].assignments.name,null);
    assert.doesNotMatch(JSON.stringify(record.publicationOwners),/PRIVATE OWNER|FOREIGN INSTITUTION OWNER|FUTURE OWNER/);
    if(ownerId!==future)assert.doesNotMatch(JSON.stringify(record),/PRIVATE OWNER|FOREIGN INSTITUTION OWNER/);
  }
  await db.query('update auditoria set datos_antes=$1::jsonb,datos_despues=$2::jsonb where id=$3',[JSON.stringify({propietario_id:user}),JSON.stringify({propietario_id:foreign}),id]);
  const both=await auditDetail(id);assert.ok(both.publicationOwners[user].profile);assert.equal(both.publicationOwners[foreign].profile,null);
  await db.query('update auditoria set datos_antes=null,datos_despues=$1::jsonb where id=$2',[JSON.stringify({propietario_id:'invalid'}),id]);
  assert.equal((await auditDetail(id)).publicationOwners,undefined);
  await db.query("update auditoria set accion='OCULTAR_PUBLICACION',datos_despues=$1::jsonb where id=$2",[JSON.stringify({propietario_id:user}),id]);
  assert.equal((await auditDetail(id)).publicationOwners,undefined);
});

test('one access save retains every database audit row but exposes one complete operation through any member and action filter',async()=>{
  const {user,scoped}=await accessGroupFixture(),initial=await detail(user,scoped);
  const selected=[permissions.PUBLICAR_EVENTO,permissions.ACCEDER_ANALITICA,permissions.ACCEDER_REPORTERIA];
  assert.equal((await request(route(user,scoped),payload(initial.version,[],selected))).status,200);
  const raw=(await db.query('select * from auditoria where entidad_id=$1 order by id desc',[user])).rows,original=JSON.stringify(raw);
  assert.equal(raw.length,3);
  let listed=await (await request(auditRoute(undefined,scoped)+'?limit=2')).json();
  assert.equal(listed.data.length,1);assert.equal(listed.meta.hasMore,false);assert.equal(listed.data[0].id,raw[0].id);
  assert.deepEqual(listed.data[0].accessGroup,{count:3,actions:[{action:'ASIGNAR_PERMISO',count:3}]});
  assert.ok(!Object.hasOwn(listed.data[0],'access_group_actions'));assert.ok(!Object.hasOwn(listed.data[0],'datos_antes'));
  for(const row of raw){
    const record=await auditDetail(row.id,scoped);assert.equal(record.accessGroup.count,3);
    assert.deepEqual(record.accessGroup.recordIds,raw.map(row=>row.id));assert.equal(record.datos_antes.permissions.length,0);assert.equal(record.datos_despues.permissions.length,3);
  }
  assert.equal(JSON.stringify((await db.query('select * from auditoria where entidad_id=$1 order by id desc',[user])).rows),original);
  const current=await detail(user,scoped);
  assert.equal((await request(route(user,scoped),payload(current.version,[roles.USUARIO_AUTORIZADO],selected.slice(1)))).status,200);
  listed=await (await request(auditRoute(undefined,scoped)+'?limit=10')).json();assert.equal(listed.data.length,2);
  const mixed=listed.data.find((row:any)=>row.accessGroup.count===2);
  assert.deepEqual(mixed.accessGroup.actions,[{action:'ASIGNAR_ROL',count:1},{action:'REVOCAR_PERMISO',count:1}]);
  for(const action of ['ASIGNAR_ROL','REVOCAR_PERMISO']){
    const filtered=await (await request(auditRoute(undefined,scoped)+'?action='+action)).json();assert.equal(filtered.data.length,1);assert.equal(filtered.data[0].id,mixed.id);assert.deepEqual(filtered.data[0].accessGroup,mixed.accessGroup);
  }
  const detailMixed=await auditDetail(mixed.id,scoped);assert.equal(detailMixed.datos_antes.permissions.length,3);assert.equal(detailMixed.datos_despues.permissions.length,2);assert.equal(detailMixed.datos_despues.roles.length,1);
  assert.equal((await db.query('select count(*)::int as count from auditoria where entidad_id=$1',[user])).rows[0].count,5);
});

test('access grouping requires exact time, actor, target, scope and complete identical snapshots; legacy and unrelated records stay separate',async()=>{
  const {actor,user,scoped}=await accessGroupFixture(),stamp='2026-10-27T12:00:00.123456Z';
  const first=await seedAccessOperation(actor,user,scoped,stamp);
  const near=await seedAccessOperation(actor,user,scoped,'2026-10-27T12:00:00.123457Z');
  const differentTarget=await seedAccessOperation(actor,await profile(scoped),scoped,stamp);
  const differentActor=await seedAccessOperation(await profile(scoped),user,scoped,stamp);
  const differentData=await seedAccessOperation(actor,user,scoped,stamp,['ASIGNAR_ROL','ASIGNAR_PERMISO'],'Another snapshot');
  // Both peers must share the same data; reusing first's snapshots distinguishes only microsecond/actor/target.
  for(const group of [near,differentTarget,differentActor])for(const id of group.ids){
    await db.query('update auditoria set datos_antes=$1::jsonb,datos_despues=$2::jsonb where id=$3',[JSON.stringify(first.before),JSON.stringify(first.after),id]);
  }
  const separate:string[]=[];
  for(const action of ['ASIGNAR_ROL','ASIGNAR_PERMISO','SUSPENDER_CUENTA','SUSPENDER_CUENTA']){
    const id=await seedAudit(actor,user,scoped,action==='SUSPENDER_CUENTA'?first.before:null,action==='SUSPENDER_CUENTA'?first.after:null);separate.push(id);
    await db.query('update auditoria set accion=$1,created_at=$2::timestamptz where id=$3',[action,stamp,id]);
  }
  const foreign=await seedAccessOperation(actor,user,otherCampus,stamp);
  const foreignInstitution=randomUUID();await db.query("insert into institucion(id,nombre) values($1,'Foreign grouping')",[foreignInstitution]);
  const wrongInstitution=await seedAccessOperation(actor,user,scoped,stamp);await db.query('update auditoria set institucion_id=$1 where id=any($2::uuid[])',[foreignInstitution,wrongInstitution.ids]);
  const list=await (await request(auditRoute(undefined,scoped)+'?limit=100')).json();
  const expected=[first.ids[0],near.ids[0],differentTarget.ids[0],differentActor.ids[0],differentData.ids[0],...separate];
  assert.deepEqual(new Set(list.data.map((row:any)=>row.id)),new Set(expected));
  assert.ok(list.data.filter((row:any)=>row.accessGroup).every((row:any)=>row.accessGroup.count===2));
  assert.equal((await auditDetail(first.ids[1],scoped)).accessGroup.count,2);
  assert.equal((await request(auditRoute(foreign.ids[0],scoped))).status,404);assert.equal((await request(auditRoute(wrongInstitution.ids[0],scoped))).status,404);
  for(const id of separate)assert.equal((await auditDetail(id,scoped)).accessGroup,undefined);
});

test('access operations group before pagination, date/action filters and SQL/Mongo merge without duplicate or missing cards',async()=>{
  const {actor,user,scoped}=await accessGroupFixture();const expected:{id:string;created_at:string}[]=[];
  for(let minute=0;minute<25;minute++){
    const created_at=`2026-10-27T12:${String(minute).padStart(2,'0')}:00.123456Z`;
    const group=await seedAccessOperation(actor,user,scoped,created_at);expected.push({id:group.ids[0],created_at});
  }
  const mongo:AuditEntry={id:'activity:6ad94d868ef4abc14cd98feb:created',actor_usuario_id:actor,campus_id:scoped,institucion_id:institution,
    entidad_tipo:'actividad',entidad_id:'6ad94d868ef4abc14cd98feb',accion:'CREAR_ACTIVIDAD',created_at:'2026-10-27T12:13:30.000Z'};
  mongoEntries=[mongo];const {compareAuditEntries}=await import('../src/modules/users/domain/audit.timeline.js');
  const ordered=[...expected,mongo].sort((a,b)=>compareAuditEntries(a as AuditEntry,b as AuditEntry));const actual:string[]=[];
  for(const page of [1,2]){
    const result=await (await request(auditRoute(undefined,scoped)+`?limit=20&page=${page}`)).json();actual.push(...result.data.map((row:any)=>row.id));
    assert.equal(result.meta.hasMore,page===1);assert.equal(result.data.length,page===1?20:6);
    assert.equal(result.meta.total,26,'Count grouped operations, not individual assignment rows');
  }
  assert.deepEqual(actual,ordered.map(row=>row.id));assert.equal(new Set(actual).size,26);
  const mongoBefore=mongoReads;
  const filtered=await (await request(auditRoute(undefined,scoped)+'?limit=100&action=ASIGNAR_PERMISO')).json();assert.equal(filtered.data.length,25);assert.equal(mongoReads,mongoBefore);
  assert.equal(filtered.meta.total,25);
  assert.ok(filtered.data.every((row:any)=>row.accessGroup.count===2&&row.accessGroup.actions.length===2));
  const range=new URLSearchParams({from:'2026-10-27T12:13:00.000Z',before:'2026-10-27T12:15:00.000Z',limit:'100'});
  const dated=await (await request(auditRoute(undefined,scoped)+'?'+range)).json();assert.equal(dated.data.length,3);assert.equal(dated.meta.hasMore,false);
  assert.equal(dated.meta.total,3);
  assert.equal(dated.data.filter((row:any)=>row.accessGroup).length,2);
  const beyond=await (await request(auditRoute(undefined,scoped)+'?page=99&limit=20')).json();assert.deepEqual(beyond.data,[]);assert.equal(beyond.meta.total,26);
  const empty=await (await request(auditRoute(undefined,scoped)+'?from=2027-01-01T00:00:00.000Z')).json();assert.deepEqual(empty.data,[]);assert.equal(empty.meta.total,0);
});

test('audit name search combines content and scoped responsible names before pagination, totals and mixed source ordering',async()=>{
  const {user,scoped}=await accessGroupFixture();
  await db.query("update perfil_usuario set nombre_completo='Carlos Soto',created_at='2020-01-01' where id=$1",[user]);
  const second=await profile(scoped,'Diego Soto');await db.query("update perfil_usuario set created_at='2020-01-01' where id=$1",[second]);
  const ids:string[]=[];
  for(let index=0;index<30;index++){
    const entity=randomUUID(),name=index<24?'Taller recurso '+index:'Sin coincidencia '+index;
    const id=await seedAudit(user,entity,scoped,{id:entity,titulo:'Nombre anterior '+index},{id:entity,titulo:name});
    await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion='EDITAR_PUBLICACION',created_at=$2::timestamptz where id=$1",[id,`2026-10-27T12:00:${String(index).padStart(2,'0')}.000001Z`]);
    if(index<24)ids.push(id);
  }
  const entity=randomUUID(),other=await seedAudit(second,entity,scoped,null,{id:entity,titulo:'Taller de Diego'});
  await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion='PUBLICAR_PUBLICACION' where id=$1",[other]);
  const mongo:AuditEntry={id:'activity:6ad94d868ef4abc14cd98feb:created',actor_usuario_id:user,campus_id:scoped,institucion_id:institution,
    entidad_tipo:'actividad',entidad_id:'6ad94d868ef4abc14cd98feb',accion:'CREAR_ACTIVIDAD',created_at:'2026-10-27T12:00:15.000Z',entity_name:'Taller actividad'};
  mongoEntries=[mongo,{...mongo,id:'foreign',campus_id:otherCampus}];
  const search=new URLSearchParams({contentName:'  TALLER  ',userName:'  carLOS  ',limit:'20'}),actual:string[]=[];
  for(const page of [1,2]){
    search.set('page',String(page));const response=await request(auditRoute(undefined,scoped)+'?'+search);assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.meta.total,25);assert.equal(result.data.length,page===1?20:5);assert.equal(result.meta.hasMore,page===1);
    assert.ok(result.data.every((row:any)=>row.actor.name==='Carlos Soto'&&row.entity_name.toLowerCase().includes('taller')));actual.push(...result.data.map((row:any)=>row.id));
  }
  assert.equal(new Set(actual).size,25);assert.deepEqual(new Set(actual),new Set([...ids,mongo.id]));
  search.set('page','1');search.set('action','CREAR_ACTIVIDAD');const activity=await (await request(auditRoute(undefined,scoped)+'?'+search)).json();assert.equal(activity.meta.total,1);assert.equal(activity.data[0].id,mongo.id);
  search.set('action','EDITAR_PUBLICACION');const reads=mongoReads;const resources=await (await request(auditRoute(undefined,scoped)+'?'+search)).json();assert.equal(resources.meta.total,24);assert.equal(mongoReads,reads);
  search.set('contentName','Nombre anterior');assert.equal((await (await request(auditRoute(undefined,scoped)+'?'+search)).json()).meta.total,30,'All matching old titles remain searchable after rename');
  search.set('contentName','Taller');search.set('from','2026-10-27T12:00:10.000Z');search.set('before','2026-10-27T12:00:13.000Z');assert.equal((await (await request(auditRoute(undefined,scoped)+'?'+search)).json()).meta.total,3);
  search.delete('action');search.delete('from');search.delete('before');
  await seedAccessOperation(user,second,scoped,'2026-10-27T13:00:00.000001Z');
  const grouped=await (await request(auditRoute(undefined,scoped)+'?userName=carLOS&action=ASIGNAR_PERMISO')).json();
  assert.equal(grouped.meta.total,1);assert.equal(grouped.data[0].accessGroup.count,2);
  await db.query('update perfil_usuario set campus_id=$2 where id=$1',[user,otherCampus]);assert.equal((await (await request(auditRoute(undefined,scoped)+'?'+search)).json()).meta.total,0,'Moved profile cannot be searched by its now foreign name');
  await db.query("update perfil_usuario set campus_id=$2,created_at='2027-01-01' where id=$1",[user,scoped]);assert.equal((await (await request(auditRoute(undefined,scoped)+'?'+search)).json()).meta.total,0,'No responsible name before profile existed');
});

test('audit content search preserves recorded titles, retired resources, report snapshots and literal special characters without foreign fallback',async()=>{
  const {user,scoped}=await accessGroupFixture();const pub=await publication(user,'DIGITAL','OCULTO',scoped);
  await db.query("update publicacion_recurso set titulo='100%_[Calculo].*',deleted_at=now() where id=$1",[pub]);
  const recorded=await seedAudit(user,pub,scoped,{id:pub,titulo:'Historico original'},{id:pub,titulo:'Historico final'}),legacy=await seedAudit(user,pub,scoped);
  await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion='RETIRAR_PUBLICACION' where id=any($1::uuid[])",[[recorded,legacy]]);
  const query=(contentName:string)=>request(auditRoute(undefined,scoped)+'?'+new URLSearchParams({contentName})).then(response=>response.json());
  assert.deepEqual((await query('100%_[Calculo].*')).data.map((row:any)=>row.id),[legacy]);
  assert.deepEqual((await query('Historico original')).data.map((row:any)=>row.id),[recorded]);
  assert.equal((await query("%' OR 1=1 --")).meta.total,0);assert.equal((await query('.*')).meta.total,1,'Special characters are literal, not a wildcard');
  const foreignPub=await publication(user,'FISICO','DISPONIBLE',otherCampus),foreignRecord=await seedAudit(user,foreignPub,scoped);
  await db.query("update publicacion_recurso set titulo='Foreign Secret Title' where id=$1",[foreignPub]);await db.query("update auditoria set entidad_tipo='publicacion_recurso' where id=$1",[foreignRecord]);
  assert.equal((await query('Foreign Secret')).meta.total,0);
  const report=randomUUID(),frozen={publication:{titulo:'Contenido denunciado congelado'}};
  await db.query("insert into reporte_contenido(id,reportante_id,campus_id,entidad_tipo,entidad_id,motivo,contenido_reportado_json) values($1,$2,$3,'PUBLICACION_DIGITAL',$4,'OTHER',$5::jsonb)",[report,user,scoped,pub,JSON.stringify(frozen)]);
  const audit=await seedAudit(user,report,scoped);await db.query("update auditoria set entidad_tipo='reporte_contenido',accion='DESESTIMAR_DENUNCIA' where id=$1",[audit]);
  assert.deepEqual((await query('denunciado congelado')).data.map((row:any)=>row.id),[audit]);
  assert.deepEqual((await db.query('select contenido_reportado_json from reporte_contenido where id=$1',[report])).rows[0].contenido_reportado_json,frozen);
});

test('audit name filters reject arrays, nested values, control characters and oversized names without changing authorization',async()=>{
  const {actor,user}=await fixture();
  for(const key of ['contentName','userName']){
    for(const suffix of [`${key}=a&${key}=b`,`${key}[name]=test`,new URLSearchParams({[key]:'x'.repeat(101)}).toString(),`${key}=a%00b`]){
      assert.equal((await request(auditRoute()+'?'+suffix)).status,400);
    }
  }
  const query='?contentName=hello&userName=user';authUser=user;const reads=mongoReads;assert.equal((await request(auditRoute()+query)).status,403);assert.equal(mongoReads,reads);authUser=actor;
  assert.equal((await request(auditRoute(undefined,otherCampus)+query)).status,403);
});

test('publication edits group across actors before paging, preserve raw versions and filter matching editions only',async()=>{
  const {actor,user,scoped}=await accessGroupFixture(),entity=randomUUID(),other=randomUUID();
  await db.query("update perfil_usuario set nombre_completo='Editor local',created_at='2020-01-01' where id=$1",[user]);
  const ids:string[]=[];
  for(let index=0;index<7;index++){
    const id=await seedAudit(index%2?actor:user,entity,scoped,{id:entity,titulo:'Anterior '+index,precio:index},{id:entity,titulo:'Nuevo '+index,precio:index+1});ids.push(id);
    await db.query("update auditoria set entidad_tipo=$1,accion='EDITAR_PUBLICACION',created_at=$2::timestamptz where id=$3",[
      index%2?'PUBLICACION_FISICA':'publicacion_recurso',`2026-10-27T12:00:00.00000${index}Z`,id]);
  }
  const create=await seedAudit(user,entity,scoped),retire=await seedAudit(user,entity,scoped),another=await seedAudit(user,other,scoped);
  for(const [id,action,stamp] of [[create,'PUBLICAR_PUBLICACION','11:00:00'],[retire,'RETIRAR_PUBLICACION','13:00:00'],[another,'EDITAR_PUBLICACION','12:30:00']])
    await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion=$1,created_at=$2::timestamptz where id=$3",[action,'2026-10-27T'+stamp+'Z',id]);
  const foreign=await seedAudit(actor,entity,otherCampus);await db.query("update auditoria set entidad_tipo='publicacion_recurso',accion='EDITAR_PUBLICACION' where id=$1",[foreign]);
  const original=(await db.query('select * from auditoria where id=any($1::uuid[]) order by id',[ids])).rows;
  const pages:any[]=[];
  for(const page of [1,2]){
    const response=await request(auditRoute(undefined,scoped)+`?page=${page}&limit=2`);assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.meta.total,4);assert.equal(result.meta.hasMore,page===1);pages.push(...result.data);
  }
  assert.deepEqual(pages.map(row=>row.id),[retire,another,ids[6],create]);assert.deepEqual(pages[2].editGroup,{count:7});
  assert.equal(pages[1].editGroup,undefined);assert.ok(pages.every(row=>!('edit_group_count' in row)&&!('access_group_actions' in row)));
  const filtered=await (await request(auditRoute(undefined,scoped)+'?action=EDITAR_PUBLICACION&userName=Editor&contentName=Nuevo&before=2026-10-27T12:00:00.001Z')).json();
  assert.equal(filtered.meta.total,1);assert.equal(filtered.data[0].id,ids[6]);assert.deepEqual(filtered.data[0].editGroup,{count:4});
  const one=await (await request(auditRoute(undefined,scoped)+'?contentName=Nuevo%200')).json();assert.equal(one.data.length,1);assert.equal(one.data[0].editGroup,undefined);
  assert.deepEqual((await auditDetail(ids[0],scoped)).editGroup,{count:7},'A filtered old anchor opens the full chronology');
  const versions:any[]=[];
  for(const page of [1,2]){
    const response=await request(auditRoute(ids[0],scoped)+`/edits?page=${page}&limit=5`);assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.meta.total,7);assert.equal(result.meta.hasMore,page===1);versions.push(...result.data);
  }
  assert.deepEqual(versions.map(row=>row.id),ids.toReversed());
  assert.ok(versions.every(row=>row.changes.complete && JSON.stringify(row.changes.fields)===JSON.stringify(['titulo','precio'])));
  assert.ok(versions.every(row=>row.actor&& !row.editGroup && !('datos_despues' in row)&&!('responsibleProfile' in row)));
  assert.equal((await auditDetail(ids[2],scoped)).datos_despues.precio,3);
  assert.deepEqual((await db.query('select * from auditoria where id=any($1::uuid[]) order by id',[ids])).rows,original);
  for(const id of [create,retire,foreign,randomUUID()])assert.equal((await request(auditRoute(id,scoped)+'/edits')).status,404);
  assert.equal((await request(auditRoute(ids[0],scoped)+'/edits?page=0')).status,400);
  authUser=user;const reads=mongoReads;assert.equal((await request(auditRoute(ids[0],scoped)+'/edits')).status,403);assert.equal(mongoReads,reads);authUser=actor;
});

test('activity edit chronology keeps one occurrence, excludes creation/deletion and rechecks authorization before Mongo',async()=>{
  const {actor,user}=await fixture();const value=auditActivity(user,campus,{type:'OFFICIAL_EVENT',status:'DELETED',deletedAt:new Date('2026-10-27T15:00:00Z')});
  const snapshot={title:'Original',type:value.type,status:'ACTIVE',startAt:value.startAt,endAt:value.endAt,location:value.location};
  const changes=Array.from({length:7},(_,index)=>({_id:new ObjectId(),operationId:new ObjectId(),campusId:campus,activityId:value._id,actorUserId:index%2?actor:user,
    revision:index+1,scope:'ONE' as const,changedAt:new Date(`2026-10-27T13:00:0${index}Z`),before:snapshot,after:{...snapshot,title:'Edicion '+index},changedFields:['title'],notificationReasons:[]}));
  const deletion={...changes[6],_id:new ObjectId(),revision:8,after:{...snapshot,status:'DELETED',deletedAt:value.deletedAt}};
  value.changeHistory=[...changes,deletion,{...changes[0],_id:new ObjectId(),activityId:new ObjectId()}];mongoDocuments=[value,auditActivity(actor)];
  const {activityAuditId}=await import('../src/modules/users/repositories/audit.activities.repository.js'),id=activityAuditId(value._id,'change:'+changes[0]._id.toHexString());
  const original=JSON.stringify(value),versions:any[]=[];
  assert.deepEqual((await auditDetail(id)).editGroup,{count:7});
  for(const page of [1,2]){
    const response=await request(auditRoute(id)+`/edits?limit=5&page=${page}`);assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.meta.total,7);assert.equal(result.meta.hasMore,page===1);versions.push(...result.data);
  }
  assert.deepEqual(versions.map(row=>row.id),changes.toReversed().map(change=>activityAuditId(value._id,'change:'+change._id.toHexString())));
  assert.ok(versions.every(row=>row.entidad_id===value._id.toHexString()&&row.accion==='EDITAR_EVENTO_OFICIAL'&&row.actor));assert.equal(JSON.stringify(value),original);
  assert.ok(versions.every(row=>row.changes.complete && JSON.stringify(row.changes.fields)===JSON.stringify(['titulo'])));
  for(const suffix of ['created','deleted','change:'+deletion._id.toHexString(),'change:'+new ObjectId().toHexString()])assert.equal((await request(auditRoute(activityAuditId(value._id,suffix))+'/edits')).status,404);
  authUser=user;let reads=mongoReads;assert.equal((await request(auditRoute(id)+'/edits')).status,403);assert.equal(mongoReads,reads);authUser=actor;
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]).then(()=>{});
  reads=mongoReads;assert.equal((await request(auditRoute(id)+'/edits')).status,403);assert.equal(mongoReads,reads);
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1',[actor]);
  mongoFailure=true;try{const response=await request(auditRoute(id)+'/edits');assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private|secret/);}finally{mongoFailure=false;}
});

test('audit rechecks actor revocation/state and campus activity after middleware', async () => {
  const {actor,user}=await fixture(),id=await seedAudit(actor,user);
  beforeTransaction=()=>db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1',[actor]).then(()=>{});
  assert.equal((await request(auditRoute())).status,403);
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1',[actor]);
  beforeTransaction=()=>db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1",[actor]).then(()=>{});
  assert.equal((await request(auditRoute(id))).status,403);
  for(const state of ['SUSPENDIDA','DESACTIVADA']) {
    await db.query('update perfil_usuario set estado_cuenta=$1 where id=$2',[state,actor]);
    for(const path of [auditRoute(),auditRoute(id)]) assert.equal((await request(path)).status,403);
  }
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA' where id=$1",[actor]);
  beforeTransaction=()=>db.query('update campus set activo=false where id=$1',[campus]).then(()=>{});
  try { assert.equal((await request(auditRoute())).status,403); } finally { await db.query('update campus set activo=true where id=$1',[campus]); }
});

test('audit database failure is sanitized and HTTP provides no history mutation route', async () => {
  const {actor,user}=await fixture(),id=await seedAudit(actor,user);
  dbFailure=true;
  try { const response=await request(auditRoute(id));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private|password|secret/); }
  finally { dbFailure=false; }
  for(const method of ['POST','PATCH','DELETE']) {
    const response=await originalFetch(base+auditRoute(id),{method,headers:{authorization:'Bearer '+token}});assert.equal(response.status,404);
  }
});

test('audit migration preserves schema/history, denies clients and permits server read/append only', async () => {
  const {actor,user}=await fixture();await seedAudit(actor,user);
  const columns=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  const history=(await db.query('select * from auditoria order by id')).rows;
  const sql=await readFile('src/database/supabase/migrations/f2_3_08_auditoria.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows,columns);
  assert.deepEqual((await db.query('select * from auditoria order by id')).rows,history);
  for(const role of ['anon','authenticated','service_role']) {
    await db.exec('set role '+role);
    try {
      if(role==='service_role') {
        assert.deepEqual((await db.query('select * from auditoria order by id')).rows,history);
        await seedAudit(actor,user);
      } else {
        await assert.rejects(db.query('select * from auditoria'),/permission denied/);
        await assert.rejects(seedAudit(actor,user),/permission denied/);
      }
      for(const command of ["update auditoria set accion='DESACTIVAR_CUENTA'",'delete from auditoria','truncate auditoria'])
        await assert.rejects(db.exec(command),/permission denied/);
    } finally { await db.exec('reset role'); }
  }
});
