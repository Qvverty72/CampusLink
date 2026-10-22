// QA local: utiliza las conexiones del backend y sus APIs reales. Nunca imprime secretos.
import dotenv from 'dotenv';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {ObjectId} from 'mongodb';
import {Temporal} from '@js-temporal/polyfill';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {newManifest,resourcePlan,activityDates,pdfFixture,pngFixture,DAY,assertOwned} from './fixtures.mjs';

const backend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Los certificados y demás rutas relativas del entorno parten del backend.
process.chdir(backend);
dotenv.config({path:resolve(backend,'.env'),quiet:true});
// Diagnóstico SQL restringido a código/constraint: nunca consulta, valores ni credenciales.
const originalQuery=pg.Client.prototype.query;
pg.Client.prototype.query=function(...args){const result=originalQuery.apply(this,args);return result?.catch?result.catch(error=>{console.error(JSON.stringify({dependency:'PostgreSQL',code:error.code,constraint:error.constraint,errorType:error.name}));throw error;}):result;};
const root=resolve(backend,'qa/local'),manifestPath=resolve(root,'manifest.json');
const command=process.argv[2]??'check';
if(!['check','seed','verify','clean','temporal'].includes(command))throw new Error('Comando: check|seed|verify|clean|temporal');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:true},connectionTimeoutMillis:15000});
let m,mg,mongoModule,server,base,stage='check';const tokens=new Map();
const log=value=>console.log(JSON.stringify(value));
const save=async()=>{await mkdir(root,{recursive:true});await writeFile(manifestPath+'.tmp',JSON.stringify(m,null,2),{mode:0o600});await rename(manifestPath+'.tmp',manifestPath);};
async function step(key,fn){if(m.steps[key])return m.steps[key];stage=key;const result=await fn();m.steps[key]=result??true;await save();log({completed:key});return result;}
async function sqlTransaction(fn){await db.query('BEGIN');try{const value=await fn();await db.query('COMMIT');return value;}catch(e){await db.query('ROLLBACK');throw e;}}
const person=actor=>m.users[typeof actor==='number'?actor:m.users.findIndex(u=>u.actor===actor)];
async function authUser(id){const result=await admin.auth.admin.getUserById(id);if(result.error&&result.error.status!==404)throw new Error('Auth lookup QA no disponible');return result.data.user;}
async function token(actor){const u=person(actor);if(tokens.has(u.id))return tokens.get(u.id);const auth=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await auth.auth.signInWithPassword({email:u.email,password:u.password});if(r.error||!r.data.session)throw new Error('Login QA falló: '+u.actor);tokens.set(u.id,r.data.session.access_token);return r.data.session.access_token;}
async function request(path,actor=4,method='GET',body,status=200){const res=await fetch(base+path,{method,headers:{Authorization:'Bearer '+await token(actor),...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});if(res.status!==status){const error=await res.json().catch(()=>({}));throw new Error(`${method} ${path}: HTTP ${res.status}, esperado ${status}; ${JSON.stringify(error.error??error).slice(0,700)}`);}if(status===204)return null;const ct=res.headers.get('content-type')??'';return ct.includes('json')?(await res.json()).data:Buffer.from(await res.arrayBuffer());}
const lib=kind=>kind==='physical'?'/marketplace/physicalgoods':'/marketplace/elibrary';
const pub=key=>m.publications.find(p=>p.key===key);
const activity=key=>m.activities.find(a=>a.key===key);
const version=async id=>(await db.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS v FROM publicacion_recurso WHERE id=$1`,[id])).rows[0].v;

async function check(){
 await db.connect();if(command!=='check')assert.equal((await db.query("SELECT pg_try_advisory_lock(hashtext('CampusLink.generalQA')) AS locked")).rows[0].locked,true,'Otra ejecución QA está en curso');mongoModule=await import('../dist/database/mongodb/client.js');mg=await mongoModule.connectMongoDB();
 const source=await mg.collection('campus_maps').findOne({status:'ACTIVE'});assert.ok(source?.buildings?.length,'Mapa activo requerido');
 for(const bucket of ['publication-images','digital-resources']){const r=await admin.storage.getBucket(bucket);assert.ok(!r.error&&!r.data.public,'Bucket privado requerido: '+bucket);}
 for(const name of ['ADMINISTRADOR','USUARIO_AUTORIZADO'])assert.equal((await db.query('SELECT count(*)::int AS n FROM rol WHERE nombre=$1',[name])).rows[0].n,1);
 for(const name of ['PUBLICAR_EVENTO','ACCEDER_ANALITICA','ACCEDER_REPORTERIA'])assert.equal((await db.query('SELECT count(*)::int AS n FROM permiso WHERE nombre=$1',[name])).rows[0].n,1);
 assert.ok((await db.query('SELECT id FROM categoria_recurso_fisico WHERE activo=true')).rows.length);
 assert.ok((await db.query("SELECT codigo FROM mensaje_solicitud WHERE activo=true AND codigo='ME_INTERESA'")).rows.length);
 log({target:new URL(process.env.SUPABASE_URL).hostname,mongo:mg.databaseName,check:'ok',command});
}
async function openApi(){if(command==='verify'&&process.argv.includes('--running-backend')){base='http://127.0.0.1:3000/api/v1';return;}const {createApp}=await import('../dist/app.js');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api/v1`;}
async function bootstrap(){
 await step('catalog',()=>sqlTransaction(async()=>{
  for(let i=0;i<2;i++)await db.query('INSERT INTO institucion(id,nombre) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[m.institutions[i],`${m.runId} Institucion ${i?'B':'A'}`]);
  for(let i=0;i<3;i++)await db.query('INSERT INTO campus(id,institucion_id,nombre) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[m.campuses[i],m.institutions[i===2?1:0],`${m.runId} ${['Principal','Segunda sede','Externa'][i]}`]);
  for(let i=0;i<2;i++)await db.query('INSERT INTO carrera(id,institucion_id,nombre,codigo) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[m.careers[i],m.institutions[0],`${m.runId} ${i?'Diseno':'Informatica'}`,`${m.runId}-C${i}`]);
  for(let i=0;i<4;i++)await db.query('INSERT INTO asignatura(id,nombre,codigo) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[m.subjects[i],`${m.runId} ${['Programacion','Bases de datos','Diseno visual','Comunicacion compartida'][i]}`,`${m.runId}-A${i}`]);
  for(let c=0;c<2;c++){for(const s of c===0?[0,1,3]:[2,3])await db.query('INSERT INTO carrera_asignatura(carrera_id,asignatura_id,semestre_nivel) VALUES($1,$2,1) ON CONFLICT DO NOTHING',[m.careers[c],m.subjects[s]]);for(const campus of m.campuses.slice(0,2))await db.query('INSERT INTO campus_carrera(campus_id,carrera_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[campus,m.careers[c]]);}
 }));
 for(const u of m.users)await step('account-'+u.actor,async()=>{
  // ID preasignado persistido antes de Auth permite recuperar un corte sin duplicar cuenta.
  const found=await authUser(u.id);
  if(!found){const r=await admin.auth.admin.createUser({id:u.id,email:u.email,password:u.password,email_confirm:true,user_metadata:{qaSeedRun:m.runId}});if(r.error)throw new Error('Auth create '+u.actor+': '+r.error.code);assert.equal(r.data.user.id,u.id);}
  else assert.equal(found.user_metadata.qaSeedRun,m.runId,'Auth ajeno');
  await sqlTransaction(async()=>{
   await db.query('INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) VALUES($1,$2,$3,$4,now()) ON CONFLICT(id) DO NOTHING',[u.id,m.institutions[u.campus===2?1:0],m.campuses[u.campus],`${m.runId} ${u.actor}`]);
   if(u.campus!==2)await db.query('INSERT INTO usuario_carrera(perfil_usuario_id,carrera_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[u.id,m.careers[u.actor==='nuevo'?1:0]]);
   if(['admin','eventos','consulta'].includes(u.actor))await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id,asignado_por_id) SELECT $1,id,$2,$3 FROM rol WHERE nombre=$4 AND NOT EXISTS(SELECT 1 FROM usuario_rol WHERE perfil_usuario_id=$1 AND revocado_en IS NULL)',[u.id,m.campuses[0],m.users[0].id,u.actor==='admin'?'ADMINISTRADOR':'USUARIO_AUTORIZADO']);
   for(const grant of u.actor==='eventos'?['PUBLICAR_EVENTO']:u.actor==='consulta'?['ACCEDER_ANALITICA','ACCEDER_REPORTERIA']:[])await db.query('INSERT INTO usuario_permiso(perfil_usuario_id,permiso_id,campus_id,otorgado_por_id) SELECT $1,id,$2,$3 FROM permiso WHERE nombre=$4 AND NOT EXISTS(SELECT 1 FROM usuario_permiso WHERE perfil_usuario_id=$1 AND permiso_id=permiso.id AND revocado_en IS NULL)',[u.id,m.campuses[0],m.users[0].id,grant]);
  });return {id:u.id};
 });
 await step('maps',async()=>{
  let source=m.sourceMap?await mg.collection('campus_maps').findOne({_id:new ObjectId(m.sourceMap.id)}):await mg.collection('campus_maps').findOne({status:'ACTIVE',campusId:{$nin:m.campuses}});
  assert.ok(source);m.sourceMap??={id:source._id.toHexString(),hash:createHash('sha256').update(JSON.stringify(source)).digest('hex')};
  for(const campus of m.campuses){let entry=m.maps.find(v=>v.campus===campus);if(!entry){entry={id:new ObjectId().toHexString(),campus};m.maps.push(entry);await save();}
   const copy=structuredClone(source);copy._id=new ObjectId(entry.id);copy.campusId=campus;copy.version=1;copy.createdAt=new Date(m.t0);copy.updatedAt=new Date(m.t0);
   // Conservar coordenadas y meshes del mapa original; dos POI independientes para fixtures.
   const building=copy.buildings.find(b=>b.isVisible!==false&&b.floors?.some(f=>f.isVisible!==false));const floor=building?.floors.find(f=>f.isVisible!==false);assert.ok(floor);
   const validPoi=copy.buildings.flatMap(b=>b.floors??[]).flatMap(f=>f.pois??[]).find(p=>p.isVisible===true&&!p.deletedAt);
   const template=validPoi?structuredClone(validPoi):{position:{x:0,y:0,z:0},type:'OTHER'};
   floor.pois??=[];for(const key of ['qa-meeting','qa-inactive'])floor.pois.push({...template,poiKey:key,name:key==='qa-meeting'?'QA Punto de encuentro':'QA Punto inactivo',isVisible:true,deletedAt:null});
   entry.location={buildingKey:building.id,floorKey:floor.id};
   await mg.collection('campus_maps').updateOne({_id:copy._id},{$setOnInsert:copy},{upsert:true});
  }
  return {source:m.sourceMap.id};
 });
 await step('qa-poi-keys',async()=>{for(const map of m.maps)for(const key of ['qa-meeting','qa-inactive'])await mg.collection('campus_maps').updateOne({_id:new ObjectId(map.id),campusId:map.campus},{$set:{'buildings.$[b].floors.$[f].pois.$[p].poiKey':key}},{arrayFilters:[{'b.id':map.location.buildingKey},{'f.id':map.location.floorKey},{'p.name':key==='qa-meeting'?'QA Punto de encuentro':'QA Punto inactivo'}]});});
 await step('qa-poi-layout',async()=>{
  for(const entry of m.maps){const map=await mg.collection('campus_maps').findOne({_id:new ObjectId(entry.id),campusId:entry.campus});
   const candidates=map.buildings.filter(b=>b.isVisible!==false&&!b.deletedAt).flatMap(b=>(b.floors??[]).filter(f=>f.isVisible!==false&&!f.deletedAt).map(f=>({b,f,poi:(f.pois??[]).find(p=>p.isVisible===true&&!p.deletedAt&&p.position&&!['qa-meeting','qa-inactive'].includes(p.poiKey)&&!['qa-meeting','qa-inactive'].includes(p.id))})));
   const target=candidates.find(c=>c.poi)??candidates[0];assert.ok(target);
   for(const b of map.buildings)for(const f of b.floors??[])f.pois=(f.pois??[]).filter(p=>!['qa-meeting','qa-inactive'].includes(p.poiKey)&&!['qa-meeting','qa-inactive'].includes(p.id));
   for(const key of ['qa-meeting','qa-inactive'])target.f.pois.push({...target.poi,poiKey:key,name:key==='qa-meeting'?'QA Punto de encuentro':'QA Punto inactivo',type:target.poi?.type??'OTHER',icon:target.poi?.icon??'location-outline',isFixed:true,isVisible:true,deletedAt:null,position:target.poi?.position??{x:0,y:0,z:0}});
   entry.location={buildingKey:target.b.id,floorKey:target.f.id};await mg.collection('campus_maps').updateOne({_id:map._id,campusId:entry.campus},{$set:{buildings:map.buildings}});
  }await save();
 });
 await assets();
}
async function assets(){await step('assets',async()=>{
 await mkdir(resolve(root,'files'),{recursive:true});
 const existing=async(key,order,fallback)=>{const p=pub(key);if(!p)return fallback;const row=(await db.query('SELECT bucket_id,storage_path FROM archivo_publicacion WHERE publicacion_id=$1 AND orden=$2',[p.id,order])).rows[0];assert.ok(row);const r=await admin.storage.from(row.bucket_id).download(row.storage_path);assert.ok(!r.error&&r.data,'Original QA no disponible');return Buffer.from(await r.data.arrayBuffer());};
 const pdf=await existing('digital-01',0,await pdfFixture('CampusLink - Material QA'));
 const second=pub('digital-05')&&m.steps['digital-multi-file']?await existing('digital-05',1,null):await pdfFixture('CampusLink - Unidad dos',true);
 for(const [name,bytes] of [['material.pdf',pdf],['material-renombrado.pdf',pdf],['unidad2.pdf',second],['imagen.png',pngFixture],['no-es-pdf.txt','Fixture de rechazo: no es PDF.']])await writeFile(resolve(root,'files',name),bytes);
});}
async function captureObjects(){m.objects=(await db.query('SELECT id,bucket_id,storage_path,publicacion_id FROM archivo_publicacion WHERE publicacion_id=ANY($1::uuid[])',[m.publications.map(p=>p.id)])).rows;await save();}
async function imageFixtures(){await step('valid-png-fixtures',async()=>{
 for(const o of m.objects.filter(o=>o.bucket_id==='publication-images')){const p=m.publications.find(p=>p.id===o.publicacion_id);assert.ok(p&&o.storage_path.startsWith(`${m.campuses[p.campus]}/${person(p.owner).id}/${p.id}/`));
  const old=await admin.storage.from(o.bucket_id).download(o.storage_path);assert.ok(!old.error);if(!Buffer.from(await old.data.arrayBuffer()).equals(pngFixture)){const r=await admin.storage.from(o.bucket_id).update(o.storage_path,pngFixture,{contentType:'image/png'});assert.ok(!r.error);await db.query('UPDATE archivo_publicacion SET tamano_bytes=$1 WHERE id=$2 AND publicacion_id=$3',[pngFixture.length,o.id,p.id]);}
 }await writeFile(resolve(root,'files/imagen.png'),pngFixture);
});}
async function resources(){
 const categories=(await db.query('SELECT id FROM categoria_recurso_fisico WHERE activo ORDER BY nombre')).rows;
 for(const kind of ['physical','digital'])for(const p of resourcePlan(kind))await step(p.key,async()=>{
  // Recuperar solo publicación del propietario/campus/título exactos si hubo corte tras POST.
  const title=`${m.runId} ${p.key}`;let saved;
  const existing=(await db.query('SELECT id FROM publicacion_recurso WHERE propietario_id=$1 AND campus_id=$2 AND titulo=$3',[person(p.owner).id,m.campuses[p.campus],title])).rows;assert.ok(existing.length<=1,'Publicacion QA duplicada');
  if(existing.length)saved=existing[0];else{
   const common={title,description:`Recurso ficticio para QA. Caso ${p.key}; sin datos personales.`,modality:p.modality,price:p.modality==='VENTA'?1500+p.n*100:null};
   if(kind==='physical')saved=await request(lib(kind),p.owner,'POST',{...common,condition:['NUEVO','BUEN_ESTADO','USADO','DETERIORADO'][p.n%4],categoryId:categories[(p.n-1)%categories.length].id,careerId:null,subjectId:null,photo:{name:'imagen.png',mimeType:'image/png',base64:pngFixture.toString('base64')}},201);
   else {const body=new FormData();let careerIds=[],subjectIds=[];
    if(p.campus!==2){if(p.n===3){careerIds=[m.careers[1]];subjectIds=[m.subjects[2]];}else if(p.n===4){careerIds=m.careers;subjectIds=[m.subjects[3]];}else{careerIds=[m.careers[0]];subjectIds=p.n===2?[]:[m.subjects[0]];}}
    body.append('metadata',JSON.stringify({...common,careerIds,subjectIds}));body.append('file',new Blob([await readFile(resolve(root,'files/material.pdf'))],{type:'application/pdf'}),'material.pdf');saved=await request(lib(kind),p.owner,'POST',body,201);
   }
  }
  if(!m.publications.some(v=>v.key===p.key))m.publications.push({...p,id:saved.id,title});await save();await captureObjects();return {id:saved.id};
 });
 await step('physical-gallery',async()=>{const p=pub('physical-05');const count=(await db.query('SELECT count(*)::int AS n FROM archivo_publicacion WHERE publicacion_id=$1 AND deleted_at IS NULL',[p.id])).rows[0].n;for(let i=count;i<3;i++)await request(lib('physical')+'/'+p.id+'/images',p.owner,'POST',{photo:{name:`imagen-${i+1}.png`,mimeType:'image/png',base64:pngFixture.toString('base64')}},201);await captureObjects();});
 await step('digital-multi-file',async()=>{const p=pub('digital-05');const count=(await db.query('SELECT count(*)::int AS n FROM archivo_publicacion WHERE publicacion_id=$1 AND deleted_at IS NULL',[p.id])).rows[0].n;if(count===1){const body=new FormData();body.append('file',new Blob([await readFile(resolve(root,'files/unidad2.pdf'))],{type:'application/pdf'}),'unidad2.pdf');await request(lib('digital')+'/'+p.id+'/files',p.owner,'POST',body,201);}await captureObjects();});
}
async function agreement(key,receiver=4,mode='complete'){
 const p=pub(key),prefix=lib(p.kind)+'/'+p.id;
 const asked=await step(key+'-request-'+receiver,async()=>{const row=(await db.query('SELECT id FROM solicitud_recurso WHERE publicacion_id=$1 AND solicitante_id=$2',[p.id,person(receiver).id])).rows[0];return row??await request(prefix+'/requests',receiver,'POST',{messageCode:'ME_INTERESA'},201);});
 if(mode==='pending')return;
 const decision=mode==='rejected'?'RECHAZAR':'ACEPTAR';
 const accepted=await step(key+'-resolve-'+receiver,async()=>{const row=(await db.query('SELECT id FROM transaccion_recurso WHERE solicitud_id=$1',[asked.id])).rows[0];return row?{transactionId:row.id}:await request(prefix+'/requests/'+asked.id,p.owner,'PATCH',{decision});});
 if(mode==='rejected')return;
 const tx=accepted.transactionId??accepted.transaction?.id;assert.ok(tx);if(!m.transactions.some(v=>v.id===tx)){m.transactions.push({id:tx,key,receiver});await save();}
 if(mode==='reserved')return;
 const txPath=prefix+'/transactions/'+tx;
 await step(key+'-owner-confirm-'+receiver,()=>request(txPath+'/confirm',p.owner,'POST',{}));
 if(mode==='single')return tx;
 if(mode==='canceled')await step(key+'-cancel-'+receiver,()=>request(txPath+'/cancel',receiver,'POST',{}));
 else {await step(key+'-receiver-confirm-'+receiver,()=>request(txPath+'/confirm',receiver,'POST',{}));await step(key+'-rating-'+receiver,()=>request(txPath+'/rating',receiver,'POST',{score:4},201));}
 return tx;
}
async function transitions(){
 await agreement('physical-22',4,'single');await agreement('physical-23');await agreement('physical-24',4,'canceled');
 await step('physical-coordination',async()=>{const p=pub('physical-22'),tx=m.transactions.find(t=>t.key===p.key);await request(`${lib('physical')}/${p.id}/transactions/${tx.id}/messages`,p.owner,'POST',{buildingId:m.maps[0].location.buildingKey,floorId:m.maps[0].location.floorKey},201);});
 await agreement('digital-06');await agreement('digital-06',1);await agreement('digital-07',4,'pending');await agreement('digital-08',4,'single');await agreement('digital-09',4,'canceled');await agreement('digital-10',4,'rejected');await agreement('digital-11');await agreement('digital-24');
 await step('digital-11-edited-terms',async()=>{const p=pub('digital-11');await request(`${lib('digital')}/${p.id}`,p.owner,'PATCH',{title:p.title,description:'Venta adquirida antes de cambiar a donacion. Precio anterior conservado en el acuerdo.',modality:'DONACION',price:null,updatedAt:await version(p.id)});});
 for(const key of ['physical-26','digital-23','digital-24'])await step(key+'-withdraw',async()=>{const p=pub(key);const row=(await db.query('SELECT deleted_at FROM publicacion_recurso WHERE id=$1',[p.id])).rows[0];if(!row.deleted_at)await request(`${lib(p.kind)}/${p.id}`,p.owner,'DELETE',{updatedAt:await version(p.id)});});
 await step('controlled-historical-fixtures',()=>sqlTransaction(async()=>{
  for(const key of ['physical-25','digital-22']){const p=pub(key);await db.query("UPDATE publicacion_recurso SET estado_publicacion='OCULTO' WHERE id=$1 AND propietario_id=$2 AND campus_id=$3",[p.id,person(p.owner).id,m.campuses[0]]);}
  for(const [key,age] of [['physical-20',8*DAY],['physical-19',7*DAY-3600000]]){const p=pub(key);await db.query('UPDATE publicacion_recurso SET publicado_en=$1 WHERE id=$2 AND propietario_id=$3 AND campus_id=$4',[new Date(Date.parse(m.t0)-age),p.id,person(p.owner).id,m.campuses[0]]);}
 }));
 await step('digital-view',()=>request('/marketplace/elibrary/'+pub('digital-12').id,4));
 for(const [kind,key] of [['physical','physical-01'],['digital','digital-01']])await step('report-'+kind,()=>request('/reports/'+(kind==='physical'?'physicalgoods':'elibrary')+'/'+pub(key).id,4,'POST',{reason:'QA contenido a revisar',description:'Denuncia ficticia pendiente; conservar evidencia sin resolver.'},201));
}
async function createActivity(key,owner,day=7,options={}){
 return step('activity-'+key,async()=>{
  const location={...m.maps[person(owner).campus].location,...(options.poi?{poiKey:options.poi}:{})};
  const dates=activityDates(m.t0,day,options.duration??2*3600000);const body={title:`${m.runId} ${key}`,description:'Actividad ficticia de QA. No representa un evento real.',...dates,location};
  let doc=await mg.collection('activities').findOne({campusId:m.campuses[person(owner).campus],title:body.title});
  const result=doc?{id:doc._id.toHexString()}:await request('/activities'+(options.official?'/official':''),owner,'POST',body,201);
  const a={id:result.id,key,owner,body};if(!m.activities.some(a=>a.key===key))m.activities.push(a);await save();return a;
 });
}
async function activities(){
 await createActivity('comunitaria-futura',3,7,{poi:'qa-meeting'});
 await createActivity('comunitaria-en-curso',4,-0.02,{duration:3*DAY});
 await createActivity('oficial-futura',1,10,{official:true});await createActivity('oficial-en-curso',1,-0.02,{official:true,duration:3*DAY});
 for(const key of ['finalizada','oculta','retirada','poi-inactivo'])await createActivity(key,1,14,{official:true,...(key==='poi-inactivo'?{poi:'qa-inactive'}:{})});
 await createActivity('otra-sede',6,8);await createActivity('otra-institucion',7,8);
 await step('activity-series',async()=>{
  const body={title:`${m.runId} serie-semanal`,description:'Tres ocurrencias oficiales para QA de recurrencia.',...activityDates(m.t0,7),location:m.maps[0].location,recurrence:{frequency:'WEEKLY',interval:1,until:Temporal.Instant.from(m.t0).add({hours:21*24}).toZonedDateTimeISO('America/Santiago').toPlainDate().toString(),timeZone:'America/Santiago',excludedDates:[]}};
  const existing=await mg.collection('activities').find({campusId:m.campuses[0],title:body.title}).toArray();let occurrences;
  if(existing.length)occurrences=existing.map(d=>({id:d._id.toHexString()}));else{const preview=await request('/activities/series/official/preview',1,'POST',body);const result=await request('/activities/series/official',1,'POST',{...body,previewHash:preview.previewHash},201);occurrences=result.series.occurrences;}
  assert.equal(occurrences.length,3);occurrences.forEach((o,i)=>{if(!m.activities.some(a=>a.id===o.id))m.activities.push({id:o.id,key:'serie-'+(i+1),owner:1});});await save();return {ids:occurrences.map(o=>o.id)};
 });
 await step('activity-participations',async()=>{
  const a=activity('oficial-futura');await request('/activities/'+a.id+'/participation',4,'PUT',{});await request('/activities/'+a.id+'/participation',5,'PUT',{});await request('/activities/'+a.id+'/participation',5,'DELETE',{});
 });
 await step('activity-finalized',async()=>{
  const a=activity('finalizada');const doc=await mg.collection('activities').findOne({_id:new ObjectId(a.id)});
  const body={...a.body,startAt:new Date(Date.parse(m.t0)-2*DAY).toISOString(),endAt:new Date(Date.parse(m.t0)-DAY).toISOString(),scope:'ONE',expectedRevision:doc.editRevision??0};
  const preview=await request(`/activities/${a.id}/edit/preview`,1,'POST',body);await request(`/activities/${a.id}`,1,'PATCH',{...body,previewHash:preview.previewHash});
 });
 await step('activity-hidden',()=>mg.collection('activities').updateOne({_id:new ObjectId(activity('oculta').id),campusId:m.campuses[0]},{$set:{visibility:'HIDDEN'}}));
 await step('activity-deleted',async()=>{const a=activity('retirada');const d=await mg.collection('activities').findOne({_id:new ObjectId(a.id)});if(d.status!=='DELETED')await request('/activities/'+a.id,1,'DELETE',{expectedRevision:d.editRevision??0});});
 await step('qa-poi-inactive',()=>mg.collection('campus_maps').updateOne({_id:new ObjectId(m.maps[0].id),campusId:m.campuses[0]},{$set:{'buildings.$[b].floors.$[f].pois.$[p].isVisible':false}},{arrayFilters:[{'b.id':m.maps[0].location.buildingKey},{'f.id':m.maps[0].location.floorKey},{'p.poiKey':'qa-inactive'}]}));
 await step('report-activity',()=>request('/reports/activities/'+activity('oficial-futura').id,4,'POST',{reason:'QA actividad',description:'Denuncia de prueba pendiente.'},201));
}
async function accountStates(){for(const [actor,state] of [['suspendido','SUSPENDIDA'],['desactivado','DESACTIVADA']])await step('state-'+actor,async()=>{const path=`/users/access/campuses/${m.campuses[0]}/users/${person(actor).id}`;const detail=await request(path,0);if(detail.accountState!==state)await request(path+'/state',0,'PATCH',{accountState:state,version:detail.version});});}
async function activityView(){await step('activity-view',async()=>{m.activityViewOperation??=randomUUID();await save();return request('/activities/'+activity('oficial-futura').id+'/interactions',4,'POST',{type:'VIEWED',operationId:m.activityViewOperation});});}

async function verify(){
 stage='verify';const checks=[];const pass=name=>{checks.push(name);log({pass:name});};
 const counts=(await db.query('SELECT tipo_recurso,count(*)::int AS n FROM publicacion_recurso WHERE id=ANY($1::uuid[]) GROUP BY tipo_recurso',[m.publications.map(p=>p.id)])).rows;
 assert.equal(counts.find(c=>c.tipo_recurso==='FISICO')?.n,28);assert.equal(counts.find(c=>c.tipo_recurso==='DIGITAL')?.n,26);pass('54 publicaciones exactas');
 assert.equal(await mg.collection('activities').countDocuments({_id:{$in:m.activities.map(a=>new ObjectId(a.id))}}),m.activities.length);assert.equal(m.activities.length>=13,true);pass('actividades, serie e historial presentes');
 for(const kind of ['physical','digital']){const path=lib(kind);const p=pub(kind+'-'+(kind==='physical'?'28':'26'));await request(path+'/'+p.id+(kind==='physical'?'/images':''),4,'GET',undefined,404);if(kind==='physical')await request(path+'/'+pub('physical-27').id+'/images',4,'GET',undefined,404);else await request(path+'/'+pub('digital-25').id,4);}
 pass('aislamiento de institución y biblioteca entre sedes');
 for(const kind of ['physical','digital']){const first=await request(lib(kind)+'?page=1&limit=20',5),second=await request(lib(kind)+'?page=2&limit=20',5);assert.equal(first.length,20);assert.ok(second.length>0);assert.ok(!second.some(b=>first.some(a=>a.id===b.id)));}pass('paginación real de20 en ambos listados');
 const gallery=await request('/marketplace/physicalgoods/'+pub('physical-05').id+'/images',4);assert.equal(gallery.images.length,3);assert.equal(gallery.expiresIn,60);const image=await fetch(gallery.images[0].url);assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),pngFixture);pass('galería3, enlace renovable60s e imagen real');
 const ranks=await request('/marketplace/elibrary/recommendations?limit=100',4),fresh=await request('/marketplace/elibrary/recommendations?limit=100',5);
 const score=(rows,key)=>rows.find(r=>r.id===pub(key).id)?.recommendation.score;assert.ok(score(ranks,'digital-01')>=50);assert.ok(score(ranks,'digital-02')>=30);assert.ok(score(ranks,'digital-03')<=5);assert.ok(score(fresh,'digital-03')>=50);assert.ok(score(fresh,'digital-01')<=5);assert.ok(!ranks.some(r=>['digital-06','digital-11','digital-21'].map(key=>pub(key).id).includes(r.id)));pass('ranking por perfil, con exclusión de propios y adquiridos');
 const events=await request('/auth/me',1),consult=await request('/auth/me',2);assert.equal(events.capabilities.officialActivities,true);assert.equal(consult.capabilities.officialActivities,false);assert.equal(consult.capabilities.analytics,true);assert.equal(consult.capabilities.reports,true);
 for(const blocked of [8,9])await request('/auth/me',blocked,'GET',undefined,403);await request('/users/access/campuses',4,'GET',undefined,403);pass('capacidades actuales y cuentas suspendida/desactivada bloqueadas');
 const visible=await request('/activities',4);for(const key of ['finalizada','oculta','retirada','poi-inactivo','otra-sede','otra-institucion'])assert.ok(!visible.some(a=>a.id===activity(key).id));for(const key of ['oficial-futura','comunitaria-futura','serie-1','serie-2','serie-3'])assert.ok(visible.some(a=>a.id===activity(key).id));pass('visibilidad de actividades, ubicaciones y tres ocurrencias');
 for(const key of ['digital-06','digital-24']){const p=pub(key),detail=await request('/marketplace/elibrary/acquired/'+p.id,4);assert.ok(detail.acquisition);const bytes=await request(`/marketplace/elibrary/${p.id}/files/${detail.files[0].id}/download`,4);assert.deepEqual(bytes,await readFile(resolve(root,'files/material.pdf')));}
 pass('descarga real con doble confirmación, incluso retirado y propietario desactivado');
 const pending=pub('digital-08'),file=m.objects.find(o=>o.publicacion_id===pending.id);await request(`/marketplace/elibrary/${pending.id}/files/${file.id}/download`,4,'GET',undefined,403);pass('confirmación única no concede acceso');
 const terms=await request('/marketplace/elibrary/acquired/'+pub('digital-11').id,4);assert.equal(terms.acquisition.amount,2600);pass('precio acordado conservado tras cambiar modalidad');
 const states=(await db.query('SELECT id,estado_publicacion FROM publicacion_recurso WHERE id=ANY($1::uuid[])',[[pub('physical-22').id,pub('physical-23').id,pub('physical-24').id]])).rows;assert.equal(states.find(s=>s.id===pub('physical-22').id).estado_publicacion,'RESERVADO');assert.equal(states.find(s=>s.id===pub('physical-23').id).estado_publicacion,'FINALIZADO');assert.equal(states.find(s=>s.id===pub('physical-24').id).estado_publicacion,'DISPONIBLE');pass('estados físicos coherentes con acuerdos');
 const source=await mg.collection('campus_maps').findOne({_id:new ObjectId(m.sourceMap.id)});assert.equal(createHash('sha256').update(JSON.stringify(source)).digest('hex'),m.sourceMap.hash);pass('mapa original intacto');
 const participants=await mg.collection('activity_participation').find({activityId:{$in:m.activities.map(a=>new ObjectId(a.id))}}).toArray();for(const a of m.activities){const d=await mg.collection('activities').findOne({_id:new ObjectId(a.id)});assert.ok(d.startAt instanceof Date&&d.endAt instanceof Date);assert.equal(d.participantCount,participants.filter(p=>p.activityId.toHexString()===a.id&&p.status==='JOINED').length);}pass('fechas BSON y contadores de participación');
 const audience=(await db.query('SELECT DISTINCT destinatario_id FROM notificacion WHERE campus_id=ANY($1::uuid[]) OR publicacion_id=ANY($2::uuid[]) OR actividad_id=ANY($3::text[])',[m.campuses,m.publications.map(p=>p.id),m.activities.map(a=>a.id)])).rows;assertOwned(m,audience.map(r=>r.destinatario_id),m.users.map(u=>u.id));pass('avisos de QA sin destinatarios ajenos');
 const reminderRows=(await db.query("SELECT publicacion_id,count(*)::int AS count FROM notificacion WHERE publicacion_id=ANY($1::uuid[]) AND tipo_notificacion='PHYSICAL_PUBLICATION_CLOSE_REMINDER' GROUP BY publicacion_id",[[pub('physical-19').id,pub('physical-20').id]])).rows;assert.ok(reminderRows.every(r=>r.count<=1),'Recordatorio duplicado');
 const notificationRows=(await db.query('SELECT tipo_notificacion,count(*)::int AS count FROM notificacion WHERE campus_id=ANY($1::uuid[]) OR publicacion_id=ANY($2::uuid[]) GROUP BY tipo_notificacion',[m.campuses,m.publications.map(p=>p.id)])).rows;
 const related=(await db.query(`SELECT (SELECT count(*)::int FROM solicitud_recurso WHERE publicacion_id=ANY($1::uuid[])) AS requests,(SELECT count(*)::int FROM transaccion_recurso WHERE publicacion_id=ANY($1::uuid[])) AS agreements,(SELECT count(*)::int FROM acceso_recurso_digital WHERE publicacion_id=ANY($1::uuid[])) AS acquisitions,(SELECT count(*)::int FROM valoracion v JOIN transaccion_recurso t ON t.id=v.transaccion_id WHERE t.publicacion_id=ANY($1::uuid[])) AS ratings,(SELECT count(*)::int FROM reporte_contenido WHERE reportante_id=ANY($2::uuid[])) AS reports`,[m.publications.map(p=>p.id),m.users.map(u=>u.id)])).rows[0];
 const report={runId:m.runId,target:new URL(process.env.SUPABASE_URL).hostname,t0:m.t0,verifiedAt:new Date().toISOString(),counts,related,activities:m.activities.length,workers:{reminders:reminderRows,notifications:notificationRows},checks,limits:['Analytics solo health; resolución general de denuncias no implementada.','Registro/OTP/recuperación requieren buzón controlado.','Conflicto F2.9-06/F2.3-05 sobre permisos admin pendiente: no se cambia la matriz.']};await writeFile(resolve(root,'report.json'),JSON.stringify(report,null,2));return report;
}

async function docs(){
 await writeFile(resolve(root,'credentials.md'),`# Cuentas QA — ${m.runId}\n\nSolo pruebas. No versionar. Contraseñas aleatorias; usuarios confirmados sin envío de correo.\n\n| Actor | Correo | Contraseña | Sede |\n|---|---|---|---|\n`+m.users.map(u=>`| ${u.actor} | ${u.email} | ${u.password} | ${u.campus} |`).join('\n')+'\n',{mode:0o600});
 await writeFile(resolve(root,'inventory.md'),`# Inventario QA — ${m.runId}\n\nFecha base UTC: ${m.t0}. Sede 0 principal; 1 misma institución; 2 institución externa.\n\n`+m.publications.map(p=>`- ${p.key}: ${p.id}; propietario ${person(p.owner).actor}`).join('\n')+'\n\n'+m.activities.map(a=>`- ${a.key}: ${a.id}`).join('\n')+`\n\nRecomendaciones: receptor (carrera Informática), nuevo (Diseño, sin interacciones). digital-01 carrera+asignatura; 02 solo carrera; 03 otra carrera; 04 compartida; 12 visto.\nFísicos: 05 galería3; 19 aún no168h en T0; 20 >168h; 22 reservado/una confirmación/coordinación; 23 completado/valorado; 24 cancelado y disponible; 25 oculto; 26 retirado; 27/28 aislamiento.\nDigitales: 05 PDFs distintos; 06 dos adquisiciones; 07 pendiente; 08 una confirmación sin acceso; 09 cancelado; 10 rechazado; 11 precio adquirido conservado; 22 oculto; 23 retirado; 24 adquirido/retirado/autor desactivado; 25/26 aislamiento.\nRecursos no caducan por antigüedad. Actividades finalizan a endAt y conservan historial; contenido ordinario tiene margen7–21d. Ejecutar temporal para una actividad corta independiente.\n`);
}

async function clean(){
 stage='clean-guards';const users=m.users.map(u=>u.id),publications=m.publications.map(p=>p.id),activityIds=m.activities.map(a=>a.id),objectIds=activityIds.map(id=>new ObjectId(id));
 assertOwned(m,users,users);
 // Cualquier dato manual nuevo, actor externo o vínculo académico ajeno impide limpiar.
 assertOwned(m,(await db.query('SELECT id FROM perfil_usuario WHERE campus_id=ANY($1::uuid[]) OR institucion_id=ANY($2::uuid[])',[m.campuses,m.institutions])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT id FROM publicacion_recurso WHERE campus_id=ANY($1::uuid[]) OR propietario_id=ANY($2::uuid[])',[m.campuses,users])).rows.map(r=>r.id),publications);
 assertOwned(m,(await db.query('SELECT solicitante_id AS id FROM solicitud_recurso WHERE publicacion_id=ANY($1::uuid[])',[publications])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT receptor_id AS id FROM transaccion_recurso WHERE publicacion_id=ANY($1::uuid[])',[publications])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT reportante_id AS id FROM reporte_contenido WHERE campus_id=ANY($1::uuid[])',[m.campuses])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT resuelto_por_id AS id FROM reporte_contenido WHERE campus_id=ANY($1::uuid[]) AND resuelto_por_id IS NOT NULL',[m.campuses])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT actor_usuario_id AS id FROM auditoria WHERE institucion_id=ANY($1::uuid[]) AND actor_usuario_id IS NOT NULL',[m.institutions])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT destinatario_id AS id FROM notificacion WHERE publicacion_id=ANY($1::uuid[]) OR actividad_id=ANY($2::text[])',[publications,activityIds])).rows.map(r=>r.id),users);
 for(const table of ['usuario_rol','usuario_permiso'])assertOwned(m,(await db.query(`SELECT perfil_usuario_id AS id FROM ${table} WHERE campus_id=ANY($1::uuid[])`,[m.campuses])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT perfil_usuario_id AS id FROM usuario_carrera WHERE carrera_id=ANY($1::uuid[])',[m.careers])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT perfil_usuario_id AS id FROM usuario_asignatura WHERE asignatura_id=ANY($1::uuid[])',[m.subjects])).rows.map(r=>r.id),users);
 assertOwned(m,(await db.query('SELECT campus_id AS id FROM campus_carrera WHERE carrera_id=ANY($1::uuid[])',[m.careers])).rows.map(r=>r.id),m.campuses);
 assertOwned(m,(await db.query('SELECT publicacion_id AS id FROM publicacion_carrera WHERE carrera_id=ANY($1::uuid[])',[m.careers])).rows.map(r=>r.id),publications);
 assertOwned(m,(await db.query('SELECT publicacion_id AS id FROM publicacion_asignatura WHERE asignatura_id=ANY($1::uuid[])',[m.subjects])).rows.map(r=>r.id),publications);
 assertOwned(m,(await db.query('SELECT carrera_id AS id FROM carrera_asignatura WHERE asignatura_id=ANY($1::uuid[])',[m.subjects])).rows.map(r=>r.id),m.careers);
 assertOwned(m,(await mg.collection('activities').find({$or:[{campusId:{$in:m.campuses}},{createdByUserId:{$in:users}}]}).project({_id:1}).toArray()).map(r=>r._id.toHexString()),activityIds);
 for(const collection of ['activity_participation','activity_interactions'])assertOwned(m,(await mg.collection(collection).find({activityId:{$in:objectIds}}).project({userId:1}).toArray()).map(r=>r.userId),users);
 for(const u of m.users){const found=await authUser(u.id);if(found)assert.equal(found.user_metadata.qaSeedRun,m.runId,'Cuenta Auth ajena');}
 const currentObjects=(await db.query('SELECT bucket_id,storage_path,publicacion_id FROM archivo_publicacion WHERE publicacion_id=ANY($1::uuid[])',[publications])).rows;
 // El manifiesto también conserva originales retirados; no derivar borrado desde un prefijo.
 for(const o of currentObjects)assert.ok(m.objects.some(old=>old.bucket_id===o.bucket_id&&old.storage_path===o.storage_path),'Archivo manual fuera del manifiesto');
 const storageObjects=[...new Map([...m.objects,...currentObjects].map(o=>[o.bucket_id+'/'+o.storage_path,o])).values()];
 for(const o of storageObjects){const p=m.publications.find(p=>p.id===o.publicacion_id);assert.ok(p&&['digital-resources','publication-images'].includes(o.bucket_id));assert.ok(o.storage_path.startsWith(`${m.campuses[p.campus]}/${person(p.owner).id}/${p.id}/`),'Ruta de Storage ajena');}
 if(process.argv.includes('--dry-run')){log({cleanDryRun:'ok',users:users.length,publications:publications.length,activities:activityIds.length,storageObjects:storageObjects.length});return;}
 // Primero suprimir pendientes del worker en documentos propios; SQL bloquea perfiles al retirar derivados.
 await step('clean-mongo',async()=>{
  await mg.collection('activities').deleteMany({_id:{$in:objectIds},campusId:{$in:m.campuses}});
  for(const name of ['activity_participation','activity_interactions'])await mg.collection(name).deleteMany({activityId:{$in:objectIds},userId:{$in:users}});
  await mg.collection('campus_maps').deleteMany({_id:{$in:m.maps.map(v=>new ObjectId(v.id))},campusId:{$in:m.campuses}});
 });
 await step('clean-sql',()=>sqlTransaction(async()=>{
  await db.query('SELECT id FROM perfil_usuario WHERE id=ANY($1::uuid[]) FOR UPDATE',[users]);
  const txs=(await db.query('SELECT id FROM transaccion_recurso WHERE publicacion_id=ANY($1::uuid[])',[publications])).rows.map(r=>r.id);
  await db.query('DELETE FROM notificacion WHERE destinatario_id=ANY($1::uuid[])',[users]);
  await db.query('DELETE FROM auditoria WHERE actor_usuario_id=ANY($1::uuid[]) AND institucion_id=ANY($2::uuid[])',[users,m.institutions]);
  await db.query('DELETE FROM reporte_contenido WHERE reportante_id=ANY($1::uuid[]) AND campus_id=ANY($2::uuid[])',[users,m.campuses]);
  for(const table of ['valoracion','acceso_recurso_digital','confirmacion_transaccion'])await db.query(`DELETE FROM ${table} WHERE transaccion_id=ANY($1::uuid[])`,[txs]);
  await db.query('DELETE FROM transaccion_recurso WHERE id=ANY($1::uuid[])',[txs]);
  await db.query('DELETE FROM solicitud_recurso WHERE publicacion_id=ANY($1::uuid[])',[publications]);
  await db.query('DELETE FROM interaccion_recurso WHERE publicacion_id=ANY($1::uuid[]) OR perfil_usuario_id=ANY($2::uuid[])',[publications,users]);
  for(const table of ['publicacion_carrera','publicacion_asignatura','archivo_publicacion','recurso_fisico','recurso_digital'])await db.query(`DELETE FROM ${table} WHERE publicacion_id=ANY($1::uuid[])`,[publications]);
  await db.query('DELETE FROM publicacion_recurso WHERE id=ANY($1::uuid[]) AND propietario_id=ANY($2::uuid[])',[publications,users]);
  for(const table of ['usuario_rol','usuario_permiso','usuario_carrera','usuario_asignatura'])await db.query(`DELETE FROM ${table} WHERE perfil_usuario_id=ANY($1::uuid[])`,[users]);
  await db.query('DELETE FROM perfil_usuario WHERE id=ANY($1::uuid[]) AND campus_id=ANY($2::uuid[])',[users,m.campuses]);
  await db.query('DELETE FROM campus_carrera WHERE campus_id=ANY($1::uuid[]) AND carrera_id=ANY($2::uuid[])',[m.campuses,m.careers]);
  await db.query('DELETE FROM carrera_asignatura WHERE carrera_id=ANY($1::uuid[]) AND asignatura_id=ANY($2::uuid[])',[m.careers,m.subjects]);
  await db.query('DELETE FROM asignatura WHERE id=ANY($1::uuid[])',[m.subjects]);await db.query('DELETE FROM carrera WHERE id=ANY($1::uuid[]) AND institucion_id=$2',[m.careers,m.institutions[0]]);
  await db.query('DELETE FROM campus WHERE id=ANY($1::uuid[]) AND institucion_id=ANY($2::uuid[])',[m.campuses,m.institutions]);await db.query('DELETE FROM institucion WHERE id=ANY($1::uuid[])',[m.institutions]);
 }));
 await step('clean-storage',async()=>{for(const bucket of ['publication-images','digital-resources']){const paths=storageObjects.filter(o=>o.bucket_id===bucket).map(o=>o.storage_path);if(paths.length){const r=await admin.storage.from(bucket).remove(paths);if(r.error)throw new Error('No se pudo retirar Storage QA');}}});
 for(const u of m.users)await step('clean-auth-'+u.actor,async()=>{const found=await authUser(u.id);if(found){const r=await admin.auth.admin.deleteUser(u.id);if(r.error)throw new Error('No se pudo retirar Auth QA '+u.actor);}});
 const remaining=(await db.query(`SELECT (SELECT count(*) FROM auth.users WHERE id=ANY($1::uuid[]))+(SELECT count(*) FROM perfil_usuario WHERE id=ANY($1::uuid[]))+(SELECT count(*) FROM publicacion_recurso WHERE id=ANY($2::uuid[]))+(SELECT count(*) FROM campus WHERE id=ANY($3::uuid[]))+(SELECT count(*) FROM institucion WHERE id=ANY($4::uuid[]))+(SELECT count(*) FROM carrera WHERE id=ANY($5::uuid[]))+(SELECT count(*) FROM asignatura WHERE id=ANY($6::uuid[]))+(SELECT count(*) FROM storage.objects WHERE bucket_id IN ('publication-images','digital-resources') AND name=ANY($7::text[])) AS total`,[users,publications,m.campuses,m.institutions,m.careers,m.subjects,storageObjects.map(o=>o.storage_path)])).rows[0].total;assert.equal(Number(remaining),0,'Residuos SQL/Auth/Storage QA');
 for(const name of ['activities','activity_participation','activity_interactions','campus_maps'])assert.equal(await mg.collection(name).countDocuments({campusId:{$in:m.campuses}}),0,'Residuos Mongo QA: '+name);
 m.cleaned=true;await save();log({cleaned:m.runId});
}

try{
 await check();if(command==='check'){}else{
  await mkdir(root,{recursive:true});try{m=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;if(command!=='seed')throw new Error('No hay manifiesto QA');m=newManifest();await save();}
  assert.equal(m.version,1);if(m.cleaned&&command!=='seed')throw new Error('El manifiesto ya fue limpiado');
  if(m.cleaned&&command==='seed'){m=newManifest();await save();}
  const target={supabase:new URL(process.env.SUPABASE_URL).hostname,mongo:mg.databaseName,postgres:(await db.query('SELECT current_database() AS name')).rows[0].name};
  if(m.target)assert.deepEqual(m.target,target,'El destino no coincide con el manifiesto');else{m.target=target;await save();}
  if(command==='seed'&&!m.cleaned&&Object.keys(m.steps).some(k=>k.startsWith('clean-')))throw new Error('Limpieza incompleta: terminar clean antes de volver a seed');
  await openApi();
  if(command==='seed'){if(!m.steps.complete){await bootstrap();await resources();await transitions();await activities();await accountStates();await step('complete',async()=>true);}await assets();await imageFixtures();await activityView();await docs();await verify();log({seed:'ready',runId:m.runId,credentials:resolve(root,'credentials.md')});}
  if(command==='verify')await verify();
  if(command==='temporal'){const key='temporal-'+Date.now();await createActivity(key,1,(Date.now()+120000-Date.parse(m.t0))/DAY,{official:true,duration:180000});await docs();log({temporal:activity(key)});}
  if(command==='clean')await clean();
 }
}catch(e){log({failed:stage,error:e.message,code:e.code});process.exitCode=1;}finally{
 if(server)await new Promise(r=>server.close(r));if(mongoModule)await mongoModule.closeMongoDB();try{const {closePostgres}=await import('../dist/database/supabase/postgres.js');await closePostgres();}catch{}await db.end().catch(()=>{});
}
