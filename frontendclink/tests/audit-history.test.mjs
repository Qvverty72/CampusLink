import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';

const native = createRequire(import.meta.url)('react-native-web');

function load(relative, dependencies = {}) {
  const source=fs.readFileSync(new URL(relative,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,require(name){assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]}});
  return module.exports;
}

const dateTime=load('../src/features/activities/types/dateTime.ts');
const dates=load('../src/features/users/utils/auditDateRange.ts',{'@/features/activities/types/dateTime':dateTime});

test('audit transport sends optional action with campus, page and cancellation; unfiltered requests remain compatible', async()=>{
  const calls=[],signal=new AbortController().signal;
  const api=load('../src/features/users/api/auditApi.ts',{'../utils/auditDateRange':dates,'@/lib/api/authenticated-request':{
    authenticatedEnvelopeRequest:async(...args)=>{calls.push(args);return {data:[],meta:{page:2,limit:20,hasMore:false}}},
  }});
  await api.loadAuditEntries('campus/id',2,signal,'RESOLVER_DENUNCIA');
  assert.equal(calls[0][0],'/api/v1/users/access/campuses/campus%2Fid/audit');
  assert.equal(calls[0][1].signal,signal);
  assert.equal(calls[0][2].toString(),'page=2&limit=20&action=RESOLVER_DENUNCIA');
  await api.loadAuditEntries('campus/id',1,signal);
  assert.equal(calls[1][2].toString(),'page=1&limit=20');
  const range={from:'27/10/2026',to:'27/10/2026'};
  await api.loadAuditEntries('campus/id',1,signal,'PUBLICAR_PUBLICACION',range);
  assert.equal(calls[2][2].get('action'),'PUBLICAR_PUBLICACION');
  assert.equal(calls[2][2].get('from'),dates.auditDateBounds(range).from);
  assert.equal(calls[2][2].get('before'),dates.auditDateBounds(range).before);
  assert.equal(calls[2][1].signal,signal);
  await api.loadAuditEntries('campus/id',1,signal,'',range,{contentName:'  Taller & cálculo  ',userName:' Carlos Soto '});
  assert.equal(calls[3][2].get('contentName'),'Taller & cálculo');assert.equal(calls[3][2].get('userName'),'Carlos Soto');
  assert.equal(calls[3][2].get('from'),dates.auditDateBounds(range).from);assert.equal(calls[3][1].signal,signal);
  await api.loadAuditEntries('campus/id',1,signal,'',undefined,{contentName:'   ',userName:''});
  assert.equal(calls[4][2].toString(),'page=1&limit=20');
});

test('edit chronology transport preserves campus, original compound identity, page and cancellation',async()=>{
  const calls=[],signal=new AbortController().signal;
  const api=load('../src/features/users/api/auditApi.ts',{'../utils/auditDateRange':dates,'@/lib/api/authenticated-request':{
    authenticatedEnvelopeRequest:async(...args)=>{calls.push(args);return {data:[],meta:{page:2,limit:5,total:7,hasMore:false}}},
  }});
  const id='activity:6ad94d868ef4abc14cd98feb:change:6ad94d868ef4abc14cd98fff';
  const result=await api.loadAuditEdits('campus/id',id,2,signal);assert.equal(result.meta.total,7);
  assert.equal(calls[0][0],'/api/v1/users/access/campuses/campus%2Fid/audit/'+encodeURIComponent(id)+'/edits');
  assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][2].toString(),'page=2&limit=5');
  const {auditEntryTitle}=load('../src/features/users/utils/auditAccessPresentation.ts',{'../types/audit':load('../src/features/users/types/audit.ts')});
  for(const [accion,title] of [['EDITAR_PUBLICACION','Ediciones de la publicación'],['EDITAR_ACTIVIDAD','Ediciones de la actividad'],['EDITAR_EVENTO_OFICIAL','Ediciones del evento oficial']])
    assert.equal(auditEntryTitle({accion,editGroup:{count:7}}),title);
  assert.equal(auditEntryTitle({accion:'EDITAR_PUBLICACION',editGroup:{count:1}}),'Publicación editada');
});

test('audit dates include whole local days, allow open bounds and validate reversed/invalid ranges',()=>{
  assert.equal(dates.auditDateRangeError({from:'28/10/2026',to:'27/10/2026'}),'La fecha Desde debe ser anterior o igual a Hasta.');
  for(const from of ['31/02/2026','29/02/2025','2026-10-27','not a date']) {
    assert.ok(dates.auditDateRangeError({from,to:''}));assert.throws(()=>dates.auditDateBounds({from,to:''}));
  }
  assert.equal(dates.auditDateRangeError({from:'29/02/2024',to:'29/02/2024'}),'');
  assert.equal(dates.auditDateRangeLabel({from:'27/10/2026',to:'27/10/2026'}),'27/10/2026');
  assert.equal(dates.auditDateRangeLabel({from:'',to:''}),'Todas las fechas');
  assert.equal(dates.auditDateRangeLabel({from:'',to:'27/10/2026'}),'Hasta 27/10/2026');
  assert.equal(dates.auditDateBounds({from:'27/10/2026',to:''}).before,undefined);
  assert.equal(dates.auditDateBounds({from:'',to:'27/10/2026'}).from,undefined);
  const previous=process.env.TZ;
  try {
    process.env.TZ='America/Santiago';
    const normal=dates.auditDateBounds({from:'27/10/2026',to:'27/10/2026'});
    assert.equal(normal.from,'2026-10-27T03:00:00.000Z');assert.equal(normal.before,'2026-10-28T03:00:00.000Z');
    const spring=dates.auditDateBounds({from:'06/09/2026',to:'06/09/2026'});
    assert.equal(spring.from,'2026-09-06T04:00:00.000Z');assert.equal(spring.before,'2026-09-07T03:00:00.000Z');
    const autumn=dates.auditDateBounds({from:'04/04/2026',to:'04/04/2026'});
    assert.equal(autumn.from,'2026-04-04T03:00:00.000Z');assert.equal(autumn.before,'2026-04-05T04:00:00.000Z');
  } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
});

test('frontend and backend action options match the approved SQL constraint, with a readable label for every option',()=>{
  const frontend=load('../src/features/users/types/audit.ts');
  const backend=load('../../backendclink/src/modules/users/access.types.ts');
  const migration=fs.readFileSync(new URL('../../backendclink/src/database/supabase/migrations/f2_4_05_edicion_fisica.sql',import.meta.url),'utf8');
  const constraint=migration.match(/CHECK \(accion IN \(([\s\S]*?)\)\)/)[1];
  const actions=[...constraint.matchAll(/'([A-Z_]+)'/g)].map(match=>match[1]).sort();
  assert.deepEqual([...backend.SQL_AUDIT_ACTIONS].sort(),actions);
  assert.deepEqual([...frontend.AUDIT_ACTIONS].sort(),[...actions,...backend.ACTIVITY_AUDIT_ACTIONS].sort());
  assert.deepEqual([...frontend.AUDIT_ACTIONS].sort(),[...backend.AUDIT_ACTIONS].sort());
  assert.ok(frontend.AUDIT_ACTIONS.every(action=>frontend.auditLabels[action]));
});

test('administrative participation transport encodes compound audit ID and keeps cancellation and pagination',async()=>{
  const calls=[],signal=new AbortController().signal;
  const api=load('../src/features/users/api/auditApi.ts',{'../utils/auditDateRange':dates,'@/lib/api/authenticated-request':{
    authenticatedEnvelopeRequest:async(...args)=>{calls.push(args);return {data:{events:[]},meta:{page:2,limit:10,hasMore:false}}},
  }});
  const id='activity:6ad94d868ef4abc14cd98feb:created';
  await api.loadAuditParticipation('campus/id',id,2,signal);
  assert.equal(calls[0][0],'/api/v1/users/access/campuses/campus%2Fid/audit/'+encodeURIComponent(id)+'/participation');
  assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][2].toString(),'page=2&limit=10');
});

test('audit reference presentation keeps names and full IDs without repeated source captions, including legacy responses',()=>{
  const colors=load('../src/types/colors.ts');
  const styles=load('../src/features/users/components/audit.styles.ts',{'react-native':native,'@/types/colors':colors});
  const access=load('../src/features/users/types/access.ts');
  const {AuditReferenceValue}=load('../src/features/users/components/AuditReferenceValue.tsx',{
    'react/jsx-runtime':jsx,'react-native':native,'../types/access':access,'./audit.styles':styles,
  });
  const id='11111111-1111-4111-8111-111111111111';
  const render=reference=>renderToStaticMarkup(React.createElement(AuditReferenceValue,{id,reference}));
  const recorded=render({kind:'user',id,name:'Camila registrada',source:'recorded'});
  assert.ok(recorded.includes('Camila registrada'));assert.ok(recorded.includes('ID: '+id));assert.ok(!recorded.includes('Nombre registrado'));
  const current=render({kind:'campus',id,name:'San Andrés actual',source:'current'});
  assert.ok(current.includes('San Andrés actual'));assert.ok(current.includes(id));assert.ok(!current.includes('Nombre actual'));
  const absent=render({kind:'user',id,name:null,source:'unavailable'});
  assert.ok(absent.includes('Nombre no disponible'));assert.ok(absent.includes(id));
  assert.ok(render().includes(id));assert.ok(!render().includes('Nombre actual'));
  assert.ok(!render({kind:'user',id:'another-id',name:'Wrong person',source:'current'}).includes('Wrong person'));
  const role=render({kind:'role',id,name:'USUARIO_AUTORIZADO',source:'recorded'});
  assert.ok(role.includes('Usuario autorizado'));assert.ok(role.includes(id));
  assert.ok(!render({kind:'user',id,name:'<script>alert(1)</script>',source:'current'}).includes('<script>'));
});

test('only the seven requested audit actions compare snapshots; a single record preserves values and original reference paths',()=>{
  const {usesAuditComparison,auditInformationFields}=load('../src/features/users/utils/auditDetailPresentation.ts');
  const {AUDIT_ACTIONS}=load('../src/features/users/types/audit.ts');
  const compared=['ASIGNAR_ROL','REVOCAR_ROL','ASIGNAR_PERMISO','REVOCAR_PERMISO','EDITAR_PUBLICACION','EDITAR_ACTIVIDAD','EDITAR_EVENTO_OFICIAL'];
  assert.deepEqual([...AUDIT_ACTIONS].filter(usesAuditComparison),compared);assert.equal(usesAuditComparison('FUTURE_ACTION'),false);
  const entry={datos_antes:{motivo:'Motivo original',estado:'ACTIVA',retirada:'Antes',ubicacion:{piso:'anterior'}},
    datos_despues:{estado:'SUSPENDIDA',retirada:null,ubicacion:{piso:'nuevo'},roles:[],habilitada:false}};
  const original=JSON.stringify(entry),fields=auditInformationFields(entry);
  assert.deepEqual(JSON.parse(JSON.stringify(fields)),[
    {key:'motivo',value:'Motivo original',path:'datos_antes.motivo'},
    {key:'estado',value:'SUSPENDIDA',path:'datos_despues.estado'},
    {key:'retirada',value:null,path:'datos_despues.retirada'},
    {key:'ubicacion',value:{piso:'nuevo'},path:'datos_despues.ubicacion'},
    {key:'roles',value:[],path:'datos_despues.roles'},
    {key:'habilitada',value:false,path:'datos_despues.habilitada'},
  ]);
  assert.equal(JSON.stringify(entry),original);
  assert.equal(auditInformationFields({datos_antes:null,datos_despues:null}).length,0);
  assert.equal(auditInformationFields({datos_antes:{id:'old'},datos_despues:{}})[0].path,'datos_antes.id');
});

test('audit change summary identifies nested changes, additions, removals and empty values without mutating history',()=>{
  const {auditChangedFields}=load('../src/features/users/utils/auditDetailPresentation.ts');
  const entry={datos_antes:{titulo:'Anterior',precio:15000,descripcion:'Texto',nota:'Anterior',habilitada:true,
    ubicacion:{edificio_clave:'h',piso_clave:'1',poi_clave:'biblioteca'},roles:[],permissions:[]},
    datos_despues:{titulo:'Nuevo',precio:0,descripcion:null,habilitada:false,nuevo:null,
      ubicacion:{edificio_clave:'b',piso_clave:'1'},roles:[{id:'role-id',nombre:'ADMINISTRADOR'}],permissions:[]}};
  const original=JSON.stringify(entry),result=auditChangedFields(entry);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{complete:true,fields:[
    {path:['titulo'],kind:'modified'},{path:['precio'],kind:'modified'},{path:['descripcion'],kind:'modified'},
    {path:['nota'],kind:'removed'},{path:['habilitada'],kind:'modified'},
    {path:['ubicacion','edificio_clave'],kind:'modified'},{path:['ubicacion','poi_clave'],kind:'removed'},
    {path:['roles'],kind:'modified'},{path:['nuevo'],kind:'added'},
  ]});
  assert.equal(JSON.stringify(entry),original);
  assert.deepEqual(JSON.parse(JSON.stringify(auditChangedFields({datos_antes:{roles:[{id:'a'}]},datos_despues:{roles:[]}}))),
    {complete:true,fields:[{path:['roles'],kind:'modified'}]});
});

test('audit change summary ignores object/assignment order and reference names but preserves array changes and incomplete history',()=>{
  const {auditChangedFields}=load('../src/features/users/utils/auditDetailPresentation.ts');
  const same={datos_antes:{ubicacion:{edificio:'h',piso:'1'},roles:[{id:'a',nombre:'A'},{id:'b',nombre:'B'}],permissions:[{id:'c'},{id:'d'}]},
    datos_despues:{permissions:[{id:'d'},{id:'c'}],roles:[{nombre:'B',id:'b'},{nombre:'A',id:'a'}],ubicacion:{piso:'1',edificio:'h'}},
    references:{'datos_antes.ubicacion.edificio':{name:'Nombre anterior'},'datos_despues.ubicacion.edificio':{name:'Nombre vigente'}}};
  assert.equal(auditChangedFields(same).fields.length,0);
  for(const pair of [{datos_antes:null,datos_despues:{titulo:'Actual'}},{datos_antes:{titulo:'Anterior'},datos_despues:null}]){
    const result=auditChangedFields(pair);assert.equal(result.complete,false);assert.equal(result.fields.length,0);
  }
  assert.equal(auditChangedFields({datos_antes:{},datos_despues:{}}).complete,true);
  assert.equal(auditChangedFields({datos_antes:{},datos_despues:{}}).fields.length,0);
  assert.equal(auditChangedFields({datos_antes:{images:['a','b']},datos_despues:{images:['b','a']}}).fields[0].kind,'modified');
  assert.equal(auditChangedFields({datos_antes:{roles:[{id:'a'},{id:'a'}]},datos_despues:{roles:[{id:'a'},{id:'b'}]}}).fields.length,1);
  assert.equal(auditChangedFields({datos_antes:{ubicacion:null},datos_despues:{ubicacion:{piso:'1'}}}).fields[0].path.join('.'),'ubicacion');
});

test('audit field comparisons retain each historical value and reference path, distinguishing absence from null and falsy values',()=>{
  const {auditChangeValue}=load('../src/features/users/utils/auditDetailPresentation.ts');
  const beforeId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',afterId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const entry={datos_antes:{ubicacion:{edificio_clave:beforeId},precio:15000,descripcion:'Texto',soloAntes:'Retirado',roles:[]},
    datos_despues:{ubicacion:{edificio_clave:afterId},precio:0,descripcion:null,habilitada:false,roles:[{id:'role',nombre:'ADMINISTRADOR'}]}};
  const original=JSON.stringify(entry);
  const read=(path,side)=>auditChangeValue(entry,path,side);
  assert.deepEqual(JSON.parse(JSON.stringify(read(['ubicacion','edificio_clave'],'datos_antes'))),
    {present:true,value:beforeId,path:'datos_antes.ubicacion.edificio_clave'});
  assert.deepEqual(JSON.parse(JSON.stringify(read(['ubicacion','edificio_clave'],'datos_despues'))),
    {present:true,value:afterId,path:'datos_despues.ubicacion.edificio_clave'});
  assert.equal(read(['precio'],'datos_despues').value,0);assert.equal(read(['habilitada'],'datos_despues').value,false);
  assert.equal(read(['descripcion'],'datos_despues').present,true);assert.equal(read(['descripcion'],'datos_despues').value,null);
  assert.equal(read(['soloAntes'],'datos_despues').present,false);assert.equal(read(['habilitada'],'datos_antes').present,false);
  assert.equal(read(['ubicacion','poi_clave'],'datos_despues').present,false);
  assert.equal(read(['constructor'],'datos_antes').present,false,'Inherited properties are not historical fields');
  assert.equal(read(['roles'],'datos_despues').value,entry.datos_despues.roles);
  assert.equal(auditChangeValue({datos_antes:null,datos_despues:{}},['titulo'],'datos_antes').present,false);
  assert.equal(JSON.stringify(entry),original);
});

test('audit assignment names preserve recorded labels and use only matching catalog or assignment references from the same side',()=>{
  const {auditAssignmentNames}=load('../src/features/users/utils/auditDetailPresentation.ts');
  const rows=[{id:'assignment-a',catalog_id:'catalog-a',nombre:'PUBLICAR_EVENTO',campus_id:'campus'},
    {id:'assignment-b',catalog_id:'catalog-b',nombre:'  '},{id:'assignment-c',catalog_id:'catalog-c'}];
  const ref=(kind,id,name,source='current')=>({kind,id,name,source});
  const references={
    'datos_despues.permissions.0.catalog_id':ref('permission','catalog-a','Renamed current catalog'),
    'datos_despues.permissions.1.catalog_id':ref('permission','catalog-b','AC CATALOG'),
    'datos_despues.permissions.2.id':ref('assignment','assignment-c','ASSIGNMENT LABEL','recorded'),
    'datos_antes.permissions.1.catalog_id':ref('permission','catalog-b','OLDER SIDE'),
  };
  const original=JSON.stringify(rows);
  assert.deepEqual(Array.from(auditAssignmentNames(rows,'datos_despues.permissions',references)),['PUBLICAR_EVENTO','AC CATALOG','ASSIGNMENT LABEL']);
  assert.deepEqual(Array.from(auditAssignmentNames(rows,'datos_antes.permissions',references)),['PUBLICAR_EVENTO','OLDER SIDE',null]);
  assert.equal(JSON.stringify(rows),original);
});

test('audit assignment names never substitute raw IDs, unrelated reference kinds or unavailable names',()=>{
  const {auditAssignmentNames}=load('../src/features/users/utils/auditDetailPresentation.ts');
  const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const rows=[{id,catalog_id:'c'},null,{},id];
  for(const ref of [{kind:'role',id:'wrong',name:'Wrong role',source:'current'},
    {kind:'permission',id:'c',name:'Wrong kind',source:'current'},
    {kind:'role',id:'c',name:'Unavailable',source:'unavailable'}]){
    assert.deepEqual(Array.from(auditAssignmentNames(rows,'datos_antes.roles',{'datos_antes.roles.0.catalog_id':ref})),[null,null,null,null]);
  }
  assert.equal(auditAssignmentNames([],'datos_antes.roles').length,0);
  assert.deepEqual(Array.from(auditAssignmentNames([{nombre:'LEGACY_ROLE'}],'datos_antes.roles')),['LEGACY_ROLE']);
});

test('audit image preview transport binds campus, audit and file IDs and supports cancellation',async()=>{
  const calls=[],signal=new AbortController().signal;
  const api=load('../src/features/users/api/auditApi.ts',{'../utils/auditDateRange':dates,'@/lib/api/authenticated-request':{
    authenticatedRequest:async(...args)=>{calls.push(args);return {url:'https://private.invalid/preview',expiresIn:60}},
  }});
  await api.loadAuditImage('campus/id','audit/id','image/id',signal);
  assert.equal(calls[0][0],'/api/v1/users/access/campuses/campus%2Fid/audit/audit%2Fid/images/image%2Fid');assert.equal(calls[0][1].signal,signal);
});

test('audit image presentation preserves only historical metadata, raw byte counts and missing values, never snapshot URLs',()=>{
  const {auditImageRecords,auditImageSize}=load('../src/features/users/utils/auditImagePresentation.ts');
  const input=[{id:'image-id',nombre_original:' Foto original.png ',mime_type:'image/png',tamano_bytes:'1536',orden:0,deleted_at:'2026-10-27T12:00:00Z',url:'https://untrusted.invalid',storage_path:'private/file'},
    {id:'other',tamano_bytes:-1,orden:'1'},null];
  const original=JSON.stringify(input);
  assert.deepEqual(JSON.parse(JSON.stringify(auditImageRecords(input))),[
    {id:'image-id',name:'Foto original.png',mimeType:'image/png',bytes:1536,order:0,removedAt:'2026-10-27T12:00:00Z'},
    {id:'other',name:null,mimeType:null,bytes:null,order:1,removedAt:null},
    {id:null,name:null,mimeType:null,bytes:null,order:null,removedAt:null},
  ]);
  assert.equal(JSON.stringify(input),original);assert.ok(auditImageSize(1536).includes('KB'));assert.ok(auditImageSize(1536).includes((1536).toLocaleString('es-CL')+' bytes'));
  assert.ok(auditImageSize(1048576).includes('MB'));assert.equal(auditImageSize(12),'12 bytes');
});

test('access operation titles and summaries represent grouped grants/revocations without inventing filter actions or changing single records',()=>{
  const types=load('../src/features/users/types/audit.ts');
  const {auditEntryTitle,auditAccessSummary}=load('../src/features/users/utils/auditAccessPresentation.ts',{'../types/audit':types});
  const entry=(actions)=>({accion:'ASIGNAR_ROL',accessGroup:{count:actions.reduce((total,row)=>total+row.count,0),actions}});
  const single={accion:'ASIGNAR_ROL'};assert.equal(auditEntryTitle(single),'Asignación de rol');
  const permissions=entry([{action:'ASIGNAR_PERMISO',count:3}]);assert.equal(auditEntryTitle(permissions),'Asignación de permisos');assert.equal(auditAccessSummary(permissions.accessGroup),'3 permisos asignados');
  for(const [action,title] of [['ASIGNAR_ROL','Asignación de roles'],['REVOCAR_ROL','Revocación de roles'],['REVOCAR_PERMISO','Revocación de permisos']])assert.equal(auditEntryTitle(entry([{action,count:2}])),title);
  const mixed=entry([{action:'ASIGNAR_ROL',count:1},{action:'REVOCAR_PERMISO',count:2}]);
  assert.equal(auditEntryTitle(mixed),'Actualización de roles y permisos');assert.equal(auditAccessSummary(mixed.accessGroup),'1 rol asignado · 2 permisos revocados');
  assert.equal(auditEntryTitle(entry([{action:'ASIGNAR_ROL',count:1},{action:'REVOCAR_ROL',count:1}])),'Actualización de roles');
  assert.equal(auditEntryTitle(entry([{action:'ASIGNAR_PERMISO',count:1},{action:'REVOCAR_PERMISO',count:1}])),'Actualización de permisos');
  assert.equal(types.AUDIT_ACTIONS.length,20);
});

test('recurring creation transport preserves campus/compound anchor/pagination/abort and series titles retain event type',async()=>{
  const calls=[],signal=new AbortController().signal;
  const api=load('../src/features/users/api/auditApi.ts',{'../utils/auditDateRange':dates,'@/lib/api/authenticated-request':{
    authenticatedEnvelopeRequest:async(...args)=>{calls.push(args);return {data:{seriesId:'series',occurrences:[]},meta:{hasMore:false}}},
  }});
  await api.loadAuditOccurrences('campus/id','activity:id:created',3,signal);
  assert.equal(calls[0][0],'/api/v1/users/access/campuses/campus%2Fid/audit/activity%3Aid%3Acreated/occurrences');
  assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][2].toString(),'page=3&limit=5');
  const types=load('../src/features/users/types/audit.ts');
  const {auditEntryTitle}=load('../src/features/users/utils/auditAccessPresentation.ts',{'../types/audit':types});
  assert.equal(auditEntryTitle({accion:'PUBLICAR_EVENTO_OFICIAL',activitySeries:{seriesId:'series',count:12}}),'Serie de eventos oficiales publicada');
  assert.equal(auditEntryTitle({accion:'CREAR_ACTIVIDAD',activitySeries:{seriesId:'series',count:12}}),'Serie de actividades publicada');
  assert.equal(auditEntryTitle({accion:'PUBLICAR_EVENTO_OFICIAL'}),'Evento oficial publicado');
});

test('audit responsibility labels distinguish ordinary, permitted, authorized-role-only and administrator; legacy data stays neutral',()=>{
  const {auditActorLabel}=load('../src/features/users/utils/auditActorPresentation.ts');
  const actor=(kind,permissions=[])=>({kind,permissions,roles:[],name:'Persona',source:'assignment_history'});
  assert.equal(auditActorLabel('id',actor('user')),'Usuario');
  assert.equal(auditActorLabel('id',actor('authorized',['PUBLICAR_EVENTO'])),'Usuario con permisos');
  assert.equal(auditActorLabel('id',actor('authorized')),'Usuario autorizado');
  assert.equal(auditActorLabel('id',actor('administrator')),'Administrador');
  assert.equal(auditActorLabel('id',actor('unknown')),'Tipo no disponible');
  assert.equal(auditActorLabel('id'),'Tipo no disponible');
  assert.equal(auditActorLabel(null),'Responsable no registrado');
});

function reportPresentation() {
  return load('../src/features/users/utils/auditReportPresentation.ts',{
    '@/features/activities/types/activityReport':load('../src/features/activities/types/activityReport.ts'),
    '@/features/reports/types/review':load('../src/features/reports/types/review.ts'),
  });
}

test('publication cards preserve per-side absence/nulls and original paths, separate owner identity and retain update dates after content changes',()=>{
  const presentation=load('../src/features/users/utils/auditDetailPresentation.ts');
  const {auditPublicationFields,auditPublicationOwner,auditPublicationPrice,auditPublicationChanges,isAuditPublication}=load('../src/features/users/utils/auditPublicationPresentation.ts',{'./auditDetailPresentation':presentation});
  const entry={accion:'EDITAR_PUBLICACION',entidad_tipo:'publicacion_recurso',actor_usuario_id:'actor',responsibleProfile:{fullName:'Actor'},
    datos_antes:{titulo:'Anterior',precio:'1500.00',images:[{id:'old'}],updated_at:'old'},datos_despues:{titulo:'Nuevo',precio:null,updated_at:'new'}};
  const original=JSON.stringify(entry),after=auditPublicationFields(entry,'datos_despues');
  assert.ok(!after.some(field=>field.key==='images'));assert.equal(after.find(field=>field.key==='precio').value,null);
  const single=auditPublicationFields(entry);assert.equal(single.find(field=>field.key==='images').path,'datos_antes.images');assert.equal(single.find(field=>field.key==='precio').value,null);
  assert.equal(auditPublicationOwner(entry,'other'),null);assert.equal(auditPublicationOwner(entry,'actor').profile.fullName,'Actor');
  const enriched={...entry,publicationOwners:{other:{profile:{fullName:'Owner'},assignments:{source:'assignment_history',permissions:[]}}}};
  assert.equal(auditPublicationOwner(enriched,'OTHER').profile.fullName,'Owner');assert.equal(auditPublicationOwner({...entry,publicationOwners:{actor:{profile:null}}},'actor').profile,null);
  assert.equal(auditPublicationPrice('1500.00','VENTA','CLP').raw,'1500.00');assert.ok(auditPublicationPrice('1500.00','VENTA','CLP').label.includes('1.500'));
  assert.equal(auditPublicationPrice(0,'VENTA','CLP').raw,'0');assert.equal(auditPublicationPrice(1500,'DONACION','CLP').label,'Donación');assert.equal(auditPublicationPrice(1500,'DONACION','CLP').raw,null);
  assert.equal(auditPublicationPrice(null,'VENTA','CLP').label,'Precio no registrado');
  const changes=auditPublicationChanges(entry);assert.equal(changes.fields.at(-1).path[0],'updated_at');
  assert.equal(changes.fields.at(-1).kind,'modified');
  assert.equal(auditPublicationChanges({...entry,datos_antes:{updated_at:'old'},datos_despues:{updated_at:'new'}}).fields[0].path[0],'updated_at');
  assert.ok(isAuditPublication(entry));assert.ok(!isAuditPublication({...entry,accion:'OCULTAR_PUBLICACION'}));assert.equal(JSON.stringify(entry),original);
});

test('publication principal selection prefers active historical order, retains removed-only fallback and never reads URLs',()=>{
  const {auditPrimaryImage}=load('../src/features/users/utils/auditImagePresentation.ts');
  const images=[{id:'old',orden:0,deleted_at:'2026-10-27',url:'https://untrusted.invalid'},{id:'other',orden:2},{id:'new',orden:0}];const original=JSON.stringify(images);
  assert.equal(auditPrimaryImage(images).image.id,'new');assert.equal(auditPrimaryImage(images).index,2);assert.equal(auditPrimaryImage(images.slice(0,1)).image.id,'old');
  assert.equal(auditPrimaryImage([]),undefined);assert.equal(auditPrimaryImage([{id:'a'},{id:'b'}]).image.id,'a');
  assert.ok(!Object.hasOwn(auditPrimaryImage(images).image,'url'));assert.equal(JSON.stringify(images),original);
});

test('report audit presentation uses historical fields and matching scoped references while retaining original IDs, timestamps and resolution text',()=>{
  const {auditReportPresentation,isAuditReportResolution}=reportPresentation();
  const entry={accion:'DESESTIMAR_DENUNCIA',entidad_tipo:'reporte_contenido',entidad_id:'report',reporte_contenido_id:'report',campus_id:'campus',actor_usuario_id:'resolver',justificacion_accion:'Unrelated legacy text',
    datos_antes:{motivo:'ACTIVITY_SPAM',descripcion:'Es spam',reportante_id:'reporter',reportado_en:'2026-10-21T21:26:23.604838Z'},
    datos_despues:{entidad_tipo:'ACTIVIDAD',entidad_id:'activity',campus_id:'campus',estado_reporte:'DESESTIMADO',medida_aplicada:'NINGUNA',fundamento_resolucion:'Fundamento original',resuelto_por_id:'resolver',resuelto_en:'2026-10-23T19:00:57.674634Z'},
    references:{'datos_antes.reportante_id':{id:'reporter',kind:'user',name:'Carlos Soto',source:'current'},'datos_despues.resuelto_por_id':{id:'resolver',kind:'user',name:'Carla Soto',source:'current'},
      'datos_despues.campus_id':{id:'campus',kind:'campus',name:'San Andrés',source:'current'}}};
  const original=JSON.stringify(entry),result=auditReportPresentation(entry,'Other label');
  assert.equal(result.title,'Denuncia por spam');assert.equal(result.reason,'Spam o publicidad no relacionada');assert.equal(result.reasonCode,'ACTIVITY_SPAM');
  assert.equal(result.report.id,'report');assert.equal(result.target.id,'activity');assert.equal(result.target.label,'Actividad');assert.equal(result.campus.name,'San Andrés');
  assert.equal(result.reporter.name,'Carlos Soto');assert.equal(result.resolver.name,'Carla Soto');assert.equal(result.justification,'Fundamento original');
  assert.equal(result.statusLabel,'Desestimado');assert.equal(result.measure,'Ninguna');assert.equal(result.final,true);
  assert.equal(result.reportedAt,entry.datos_antes.reportado_en);assert.equal(result.resolvedAt,entry.datos_despues.resuelto_en);assert.equal(result.duration,'45 h 34 min');
  assert.equal(JSON.stringify(entry),original);
  for(const action of ['RESOLVER_DENUNCIA','DESESTIMAR_DENUNCIA'])assert.ok(isAuditReportResolution(action));
  for(const action of ['OCULTAR_PUBLICACION','PUBLICAR_EVENTO_OFICIAL','ASIGNAR_ROL'])assert.ok(!isAuditReportResolution(action));
});

test('report audit presentation preserves explicit nulls, avoids mismatched identities/campuses and does not infer final resolutions or elapsed time',()=>{
  const {auditReportPresentation,auditReportDuration}=reportPresentation();
  const entry={accion:'RESOLVER_DENUNCIA',entidad_tipo:'reporte_contenido',entidad_id:'report',campus_id:'current-campus',actor_usuario_id:'actor',justificacion_accion:'Must not replace explicit null',responsibleProfile:{fullName:'Current actor'},
    datos_antes:{reportante_id:'reporter',descripcion:'Old text',fundamento_resolucion:'Old decision',entidad_tipo:'ACTIVIDAD',entidad_id:'old-content',campus_id:'foreign-campus'},
    datos_despues:{descripcion:null,fundamento_resolucion:null,resuelto_por_id:null,estado_reporte:'EN_REVISION',medida_aplicada:null,entidad_id:null,resuelto_en:'bad-date',reportado_en:'2026-10-27T12:00:00Z'},
    references:{'datos_antes.reportante_id':{id:'other-user',kind:'user',name:'WRONG USER',source:'current'},'datos_antes.campus_id':{id:'foreign-campus',kind:'user',name:'WRONG CAMPUS',source:'current'}}};
  const result=auditReportPresentation(entry,'Current campus');
  assert.equal(result.description,null);assert.equal(result.justification,null);assert.equal(result.resolver.id,null);assert.equal(result.resolver.name,null);
  assert.equal(result.reporter.id,'reporter');assert.equal(result.reporter.name,null);assert.equal(result.campus.name,null);assert.equal(result.target.id,null);
  assert.equal(result.final,false);assert.equal(result.duration,null);assert.equal(result.measure,'Sin medida registrada');
  const legacy=auditReportPresentation({...entry,entidad_tipo:'publicacion_recurso',entidad_id:'publication',reporte_contenido_id:'linked-report',datos_antes:null,datos_despues:null});
  assert.equal(legacy.target.id,'publication');assert.equal(legacy.report.id,'linked-report');assert.equal(legacy.resolver.id,'actor');assert.equal(legacy.resolver.name,'Current actor');
  assert.equal(legacy.justification,entry.justificacion_accion);assert.equal(legacy.statusLabel,'Sin estado registrado');assert.equal(legacy.final,false);
  assert.equal(auditReportDuration('bad','2026-10-27T12:00:00Z'),null);assert.equal(auditReportDuration('2026-10-28','2026-10-27'),null);
  assert.equal(auditReportDuration(null,'2026-10-27'),null);assert.equal(auditReportDuration('2026-10-27T12:00:00Z','2026-10-27T12:00:30Z'),'Menos de 1 min');
});
