import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID();
let server: Server, base: string, authUser: string, invalidAuth = false, dbFailure = false;
let closePostgres: () => Promise<void>;
let beforeTransaction: (() => Promise<void>) | null = null;
let roles: Record<string,string>, permissions: Record<string,string>;
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
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select current_setting('test.user',true)::uuid$$; grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;");
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion','campus','perfil_usuario','rol','permiso','rol_permiso','usuario_rol','usuario_permiso',
    'publicacion_recurso','recurso_digital','archivo_publicacion','mensaje_solicitud','solicitud_recurso','transaccion_recurso','acceso_recurso_digital','auditoria']) {
    let sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name);
    // Report moderation is outside this fixture; audit columns and other constraints stay exact.
    if (name === 'auditoria') sql = sql.replace(/  CONSTRAINT auditoria_reporte_contenido_id_fkey[^\n]*\n/, '');
    await db.exec(sql);
  }
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_01_autenticacion.sql', 'utf8'));
  await db.exec('grant all on auditoria,rol_permiso,usuario_rol,usuario_permiso,rol,permiso to anon,authenticated');
  await db.exec(await migration());
  await db.exec('grant all on publicacion_recurso to anon,authenticated');
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_07_estado_cuenta.sql','utf8'));
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
  await db.query('insert into auth.users values ($1)',[id]);
  await db.query('insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values ($1,$2,$3,$4,now())',[id,institution,at,name]);
  return id;
}
async function fixture() {
  invalidAuth = false; dbFailure = false;
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
  assert.equal(body.data.length,1); assert.deepEqual(body.meta,{page:1,limit:1,hasMore:true});
  const all = (await (await request(route() + '?limit=100')).json()).data;
  assert.ok(all.every((row:{campusId:string;userId:string}) => row.campusId === campus && ![foreign,deleted].includes(row.userId)));
  for (const query of ['?page=0','?limit=101','?page=1&page=2']) assert.equal((await request(route() + query)).status,400);
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
