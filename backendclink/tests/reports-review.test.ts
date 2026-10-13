import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { ObjectId } from 'mongodb';
import { PGlite } from '@electric-sql/pglite';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { ReviewDependencies, ReviewTargetType } from '../src/modules/reports/reports.review.types.js';
import { parseReviewParams, parseReviewQuery } from '../src/modules/reports/reports.review.validation.js';

const db = new PGlite(), institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID();
const admin = randomUUID(), reporter = randomUUID(), recipient = randomUUID(), adminRole = randomUUID(), authorizedRole = randomUUID();
const physical = randomUUID(), digital = randomUUID(), request = randomUUID(), exchange = randomUUID();
const activityId = new ObjectId();
let repository: typeof import('../src/modules/reports/reports.review.repository.js').reviewRepository;
let list: typeof import('../src/modules/reports/reports.review.service.js').listReviewReports;
let detail: typeof import('../src/modules/reports/reports.review.service.js').getReviewReport;
let campuses: typeof import('../src/modules/reports/reports.review.service.js').listReviewCampuses;
let project: typeof import('../src/modules/reports/reports.review.service.js').reviewEvidence;
const auth = (): VerifiedAuthConnection => ({ userId: admin, campusId: otherCampus,
  roles: [{ id: adminRole, name: 'ADMINISTRADOR', campusId: campus }], permissions: [], profile: {
    id: admin, campus_id: otherCampus, institucion_id: institution, nombre_completo: 'Administradora', foto_path: null,
    verificado_en: '2026-10-13T12:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null,
  } });
const dependencies: ReviewDependencies = { transaction: operation => db.transaction(client => operation(repository(client as never))) };
async function report(type: ReviewTargetType = 'PUBLICACION_FISICA', targetId = physical, snapshot: unknown = { id: physical, title: 'Título denunciado', status: 'DISPONIBLE' }, at = campus, state = 'PENDIENTE', date = '2026-10-13T12:00:00Z') {
  const id = randomUUID();
  await db.query(`INSERT INTO reporte_contenido(id,reportante_id,campus_id,entidad_tipo,entidad_id,motivo,descripcion,
    contenido_reportado_json,estado_reporte,reportado_en) VALUES ($1,$2,$3,$4,$5,'Motivo privado','Descripción del caso',$6::jsonb,$7,$8)`,
    [id, reporter, at, type, targetId, snapshot === null ? null : JSON.stringify(snapshot), state, date]);
  return id;
}
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://review-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion','campus','perfil_usuario','rol','usuario_rol','categoria_recurso_fisico','publicacion_recurso',
    'recurso_fisico','recurso_digital','mensaje_solicitud','solicitud_recurso','transaccion_recurso','confirmacion_transaccion','reporte_contenido']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.query("INSERT INTO institucion(id,nombre) VALUES ($1,'Institución')", [institution]);
  await db.query("INSERT INTO campus(id,institucion_id,nombre) VALUES ($1,$3,'Campus A'),($2,$3,'Campus B')", [campus,otherCampus,institution]);
  for (const [id,name] of [[admin,'Administradora'],[reporter,'Denunciante'],[recipient,'Receptor']]) {
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id]);
    await db.query('INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) VALUES ($1,$2,$3,$4,now())', [id,institution,otherCampus,name]);
  }
  await db.query("INSERT INTO rol(id,nombre) VALUES ($1,'ADMINISTRADOR'),($2,'USUARIO_AUTORIZADO')", [adminRole,authorizedRole]);
  await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) VALUES ($1,$2,$3)', [admin,adminRole,campus]);
  for (const [id,type] of [[physical,'FISICO'],[digital,'DIGITAL']]) await db.query(`INSERT INTO publicacion_recurso
    (id,campus_id,propietario_id,tipo_recurso,titulo,descripcion,modalidad) VALUES ($1,$2,$3,$4,'Título actual','Texto actual','DONACION')`, [id,campus,reporter,type]);
  await db.query("INSERT INTO mensaje_solicitud(codigo,descripcion) VALUES ('QUIERO','Interés')");
  await db.query("INSERT INTO solicitud_recurso(id,publicacion_id,solicitante_id,codigo_mensaje) VALUES ($1,$2,$3,'QUIERO')", [request,digital,recipient]);
  await db.query(`INSERT INTO transaccion_recurso(id,solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada)
    VALUES ($1,$2,$3,$4,$5,'DONACION')`, [exchange,request,digital,reporter,recipient]);
  ({ reviewRepository: repository } = await import('../src/modules/reports/reports.review.repository.js'));
  ({ listReviewReports: list, getReviewReport: detail, listReviewCampuses: campuses, reviewEvidence: project } = await import('../src/modules/reports/reports.review.service.js'));
});
beforeEach(async () => {
  await db.exec('DELETE FROM reporte_contenido; DELETE FROM confirmacion_transaccion');
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',deleted_at=null WHERE id=$1", [admin]);
  await db.exec('UPDATE campus SET activo=true; DELETE FROM usuario_rol');
  await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) VALUES ($1,$2,$3)', [admin,adminRole,campus]);
  await db.query("UPDATE publicacion_recurso SET campus_id=$1,titulo='Título actual',estado_publicacion='DISPONIBLE',deleted_at=null", [campus]);
  await db.exec("UPDATE transaccion_recurso SET estado_transaccion='RESERVADA'; UPDATE solicitud_recurso SET estado_solicitud='PENDIENTE'");
});
after(() => db.close());

test('review validates campus/report UUID, strict filters, status/type and bounded pagination', () => {
  assert.equal(parseReviewParams({ campusId: campus.toUpperCase(), reportId: physical.toUpperCase() }).success, true);
  for (const params of [{}, {campusId:'invalid'}, {campusId:campus,reportId:'invalid'}, {campusId:campus,userId:admin}]) assert.equal(parseReviewParams(params).success,false);
  assert.deepEqual(parseReviewQuery({page:'2',limit:'5',status:'EN_REVISION',targetType:'TRANSACCION'}), {
    success:true,data:{page:2,limit:5,offset:5,status:'EN_REVISION',targetType:'TRANSACCION'},
  });
  for (const query of [null,{page:'0'},{limit:'101'},{status:['PENDIENTE']},{targetType:'VALORACION'},
    {status:"PENDIENTE'; DROP TABLE reporte_contenido;--"},{campusId:otherCampus},{reporterId:reporter},{offset:'0'}]) assert.equal(parseReviewQuery(query).success,false);
});
test('admin sees only currently assigned active campuses independent of current profile campus', async () => {
  assert.deepEqual(await campuses(auth(),dependencies),[{id:campus,name:'Campus A'}]);
  await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) VALUES ($1,$2,$3)',[admin,adminRole,otherCampus]);
  assert.equal((await campuses(auth(),dependencies)).length,2);
  await db.query('UPDATE campus SET activo=false WHERE id=$1',[campus]);
  assert.deepEqual(await campuses(auth(),dependencies),[{id:otherCampus,name:'Campus B'}]);
});
test('campus list paginates all states by date/id, filters status/type, and excludes detail identities/evidence', async () => {
  for (const state of ['PENDIENTE','EN_REVISION','RESUELTO','DESESTIMADO']) await report('PUBLICACION_FISICA',physical,undefined,campus,state);
  await report('PUBLICACION_DIGITAL',digital,{title:'Digital'},campus,'PENDIENTE','2026-10-13T13:00:00Z');
  await report('PUBLICACION_FISICA',physical,{title:'Otra sede'},otherCampus);
  const result = await list(auth(),campus,{limit:'2'},dependencies);
  assert.deepEqual(result.meta,{page:1,limit:2,hasMore:true}); assert.equal(result.data[0].title,'Digital');
  assert.equal(result.data.every(row => row.campusId===campus),true);
  for (const key of ['reporterId','snapshot','description','participants']) assert.equal(key in result.data[0],false);
  const filtered = await list(auth(),campus,{status:'PENDIENTE',targetType:'PUBLICACION_FISICA'},dependencies);
  assert.equal(filtered.data.length,1); assert.equal(filtered.data[0].title,'Título denunciado');
  const second = await list(auth(),campus,{limit:'2',page:'2'},dependencies);
  assert.equal(new Set([...result.data,...second.data].map(row=>row.id)).size,4);
  const last = await list(auth(),campus,{limit:'2',page:'3'},dependencies);
  assert.equal(last.data.length,1); assert.equal(last.meta.hasMore,false);
});
test('changing campus or report ID never reveals another campus report, even when its target ID matches', async () => {
  const own = await report(), other = await report('PUBLICACION_FISICA',physical,{title:'Privado B'},otherCampus);
  await assert.rejects(list(auth(),otherCampus,{},dependencies),{status:403});
  await assert.rejects(detail(auth(),otherCampus,other,dependencies),{status:403});
  await assert.rejects(detail(auth(),campus,other,dependencies),{status:404});
  await assert.rejects(detail(auth(),campus,randomUUID(),dependencies),{status:404});
  assert.equal((await detail(auth(),campus,own,dependencies)).snapshot?.title,'Título denunciado');
});
test('fresh database role/account/campus overrides stale session, report permissions and verification', async () => {
  const id = await report();
  await db.exec('UPDATE usuario_rol SET revocado_en=now()');
  await assert.rejects(detail(auth(),campus,id,dependencies),{status:403});
  await assert.rejects(campuses(auth(),dependencies),{status:403});
  await db.query('UPDATE usuario_rol SET revocado_en=null,rol_id=$1',[authorizedRole]);
  const account = auth(); account.permissions=[{id:randomUUID(),name:'ACCEDER_REPORTERIA',campusId:campus}];
  await assert.rejects(list(account,campus,{},dependencies),{status:403});
  await db.query('UPDATE usuario_rol SET rol_id=$1',[adminRole]);
  for (const state of ['SUSPENDIDA','DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$1 WHERE id=$2',[state,admin]);
    await assert.rejects(detail(auth(),campus,id,dependencies),{status:403});
  }
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',deleted_at=now() WHERE id=$1",[admin]);
  await assert.rejects(detail(auth(),campus,id,dependencies),{status:403});
  await db.query('UPDATE perfil_usuario SET deleted_at=null WHERE id=$1',[admin]);
  await db.query('UPDATE campus SET activo=false WHERE id=$1',[campus]);
  await assert.rejects(detail(auth(),campus,id,dependencies),{status:403});
});
test('private detail preserves original evidence after edit/hiding/deletion and never changes report state', async () => {
  const id = await report();
  await db.query("UPDATE publicacion_recurso SET titulo='Editada',estado_publicacion='OCULTO',deleted_at=now() WHERE id=$1",[physical]);
  const before = (await db.query('SELECT * FROM reporte_contenido WHERE id=$1',[id])).rows[0];
  const result = await detail(auth(),campus,id,dependencies);
  assert.deepEqual(result.reporter,{id:reporter,name:'Denunciante'});
  assert.equal(result.snapshot?.title,'Título denunciado'); assert.equal(result.snapshot?.status,'DISPONIBLE');
  assert.equal(result.current?.title,'Editada'); assert.equal(result.current?.status,'OCULTO'); assert.ok(result.current?.deletedAt);
  assert.deepEqual((await db.query('SELECT * FROM reporte_contenido WHERE id=$1',[id])).rows[0],before);
});
test('original transaction state/participants and current state/confirmations remain distinct after campus move', async () => {
  const id = await report('TRANSACCION',exchange,{id:exchange,ownerId:reporter,recipientId:recipient,status:'RESERVADA',publication:{id:digital,title:'Digital original',resourceType:'DIGITAL'}});
  await db.exec("UPDATE transaccion_recurso SET estado_transaccion='COMPLETADA',completada_en=now(); UPDATE solicitud_recurso SET estado_solicitud='ACEPTADA'");
  await db.query("INSERT INTO confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) VALUES ($1,$2,'PROPIETARIO'),($1,$3,'RECEPTOR')",[exchange,reporter,recipient]);
  const result = await detail(auth(),campus,id,dependencies);
  assert.equal(result.snapshot?.status,'RESERVADA'); assert.equal(result.current?.status,'COMPLETADA');
  assert.equal(result.current?.requestStatus,'ACEPTADA'); assert.equal((result.current?.confirmations as unknown[]).length,2);
  assert.deepEqual(result.participants,[{id:reporter,name:'Denunciante'},{id:recipient,name:'Receptor'}]);
  assert.equal((result.snapshot?.publication as Record<string,unknown>).title,'Digital original');
  await db.query('UPDATE publicacion_recurso SET campus_id=$1 WHERE id=$2',[otherCampus,digital]);
  const changed = await detail(auth(),campus,id,dependencies);
  assert.equal(changed.current,null); assert.equal(changed.snapshot?.status,'RESERVADA');
});
test('legacy missing evidence and unknown behavior target are explicit and never reconstructed from current data', async () => {
  const id = await report('PUBLICACION_DIGITAL',digital,null);
  const result = await detail(auth(),campus,id,dependencies);
  assert.equal(result.snapshot,null); assert.equal(result.title,null); assert.equal(result.current?.title,'Título actual');
  const legacy = await report('COMPORTAMIENTO','legacy-id',null);
  assert.equal((await detail(auth(),campus,legacy,dependencies)).current,null);
});
test('projection drops protected file locators and unrelated embedded data while keeping meaningful evidence', () => {
  const evidence = project({title:'Test',storage_path:'secret',bucket_id:'protected',downloadUrl:'https://private',
    access_token:'token',publication:{title:'Publication',storage_path:'secret'},confirmations:[{userId:recipient,role:'RECEPTOR',confirmedAt:'date',token:'secret'}]},'TRANSACCION');
  assert.equal(JSON.stringify(evidence).includes('secret'),false);
  assert.deepEqual(evidence?.publication,{title:'Publication'});
  assert.equal(JSON.stringify(project({title:'Test',bannerUrl:'https://file',notificationEvents:[{secret:true}],tags:['Tag',5]},'ACTIVIDAD')).includes('https'),false);
});
function activity(): ActivityDocument {
  const at = new Date('2026-10-13T12:00:00Z');
  return {_id:activityId,campusId:campus,createdByUserId:reporter,title:'Actividad editada',description:'Nueva descripción',
    type:'COMMUNITY_ACTIVITY',status:'ACTIVE',visibility:'HIDDEN',startAt:at,endAt:at,location:{buildingKey:'A',floorKey:'1'},
    participantCount:1,createdAt:at,updatedAt:at,deletedAt:at,editRevision:1,
    changeHistory:[{_id:new ObjectId(),operationId:new ObjectId(),campusId:campus,activityId,actorUserId:reporter,revision:1,
      scope:'ONE',changedAt:at,changedFields:['title'],notificationReasons:['CONTENT_CHANGED'],
      before:{title:'Actividad original',description:'Texto original',type:'COMMUNITY_ACTIVITY',startAt:at,endAt:at,location:{buildingKey:'A',floorKey:'1'}},
      after:{title:'Actividad editada',description:'Nueva descripción',type:'COMMUNITY_ACTIVITY',startAt:at,endAt:at,location:{buildingKey:'A',floorKey:'1'}}}]};
}
test('activity review works for hidden/removed content with original snapshot and available change history', async () => {
  const id = await report('ACTIVIDAD',activityId.toHexString(),{id:activityId.toHexString(),campusId:campus,title:'Actividad original',visibility:'PUBLIC'});
  const result = await detail(auth(),campus,id,{...dependencies,findReportedActivity:async(at,key)=>{
    assert.equal(at,campus); assert.equal(key,activityId.toHexString()); return activity();
  }});
  assert.equal(result.snapshot?.title,'Actividad original'); assert.equal(result.current?.visibility,'HIDDEN');
  assert.ok(result.current?.deletedAt); assert.equal(result.activityChanges.length,1);
  assert.equal((result.activityChanges[0].before as Record<string,unknown>).title,'Actividad original');
  assert.equal((await detail(auth(),campus,id,{...dependencies,findReportedActivity:async()=>null})).current,null);
  assert.equal((await detail(auth(),campus,id,{...dependencies,findReportedActivity:async()=>({...activity(),campusId:otherCampus})})).current,null);
});
test('activity IO rechecks admin authorization after role revocation and sanitizes database failures', async () => {
  const id = await report('ACTIVIDAD',activityId.toHexString(),{title:'Original'});
  await assert.rejects(detail(auth(),campus,id,{...dependencies,findReportedActivity:async()=>{
    await db.exec('UPDATE usuario_rol SET revocado_en=now()'); return activity();
  }}),{status:403});
  await db.exec('UPDATE usuario_rol SET revocado_en=null');
  await assert.rejects(detail(auth(),campus,id,{...dependencies,findReportedActivity:async()=>{throw new Error('private mongodb URI');}}),{status:503});
  await assert.rejects(list(auth(),campus,{}, {transaction:async()=>{throw new Error('private SQL password');}}),{
    status:503,message:'No se pudo consultar la denuncia.',
  });
});
test('review indexes are reapplicable and scope/date ordering columns match the administrative list', async () => {
  const sql = await readFile('src/database/supabase/migrations/20261013214004_f2_8_02_revision_denuncias_indices.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  const indexes = await db.query<{indexdef:string}>("SELECT indexdef FROM pg_indexes WHERE tablename='reporte_contenido'");
  assert.ok(indexes.rows.some(row=>row.indexdef.includes('(campus_id, reportado_en DESC, id DESC)')));
  assert.ok(indexes.rows.some(row=>row.indexdef.includes('(campus_id, estado_reporte, reportado_en DESC, id DESC)')));
});
test('HTTP review authenticates, rejects filter overrides and cross-campus IDs, returns no-store envelopes, and provides no resolution', async () => {
  const own = await report(), other = await report('PUBLICACION_FISICA',physical,null,otherCampus);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input)); assert.equal(url.origin,'https://review-test.invalid');
    if (url.pathname==='/auth/v1/user') return Response.json({id:admin,email:'admin@duocuc.cl',email_confirmed_at:'2026-10-13T12:00:00Z'});
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth().profile]);
    if (url.pathname.endsWith('/usuario_rol')) return Response.json([{campus_id:campus,rol:{id:adminRole,nombre:'ADMINISTRADOR'}}]);
    return Response.json([]);
  };
  const {createReportsRouter} = await import('../src/modules/reports/reports.routes.js');
  const {apiErrorHandler} = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use('/api/v1/reports',createReportsRouter(false,{},dependencies)); app.use(apiErrorHandler);
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/reports`;
  const headers = {Authorization:'Bearer review.test'};
  try {
    assert.equal((await originalFetch(base+'/campuses')).status,401);
    const response = await originalFetch(base+'/campuses/'+campus,{headers});
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const body = await response.json(); assert.equal(body.data.length,1); assert.equal(body.meta.hasMore,false);
    assert.equal(JSON.stringify(body).includes(reporter),false);
    assert.equal((await originalFetch(base+'/campuses/'+otherCampus,{headers})).status,403);
    assert.equal((await originalFetch(base+'/campuses/'+campus+'/'+other,{headers})).status,404);
    for (const path of ['/campuses?campusId='+campus,'/campuses/'+campus+'?campusId='+otherCampus,
      '/campuses/'+campus+'?status=INVALID','/campuses/'+campus+'?limit=101','/campuses/'+campus+'/'+own+'?snapshot=true',
      '/campuses/not-a-uuid']) assert.equal((await originalFetch(base+path,{headers})).status,400);
    const privateDetail = await originalFetch(base+'/campuses/'+campus+'/'+own,{headers});
    assert.equal(privateDetail.status,200); assert.equal((await privateDetail.json()).data.reporter.id,reporter);
    assert.equal((await originalFetch(base+'/campuses/'+campus+'/'+own,{headers,method:'PATCH'})).status,404);
    await db.exec('UPDATE usuario_rol SET revocado_en=now()');
    assert.equal((await originalFetch(base+'/campuses/'+campus+'/'+own,{headers})).status,403);
  } finally {
    globalThis.fetch=originalFetch;
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
