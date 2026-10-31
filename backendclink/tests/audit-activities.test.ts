import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, ObjectId } from 'mongodb';
import { auditTimeline, compareAuditEntries } from '../src/modules/users/domain/audit.timeline.js';
import type { AuditEntry, AccessCampus } from '../src/modules/users/types/access.types.js';
import type { ActivityDocument } from '../src/modules/activities/types/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/types/map.types.js';
import { auditLocationReferences } from '../src/modules/users/domain/audit.location.references.js';
import { auditEditSummary } from '../src/modules/users/domain/audit.edit-groups.js';
import { auditSnapshot } from '../src/modules/users/domain/audit.snapshot.js';

const campus: AccessCampus = { id:'22222222-2222-4222-8222-222222222222',institucion_id:'33333333-3333-4333-8333-333333333333',nombre:'Campus',activo:true };
const owner='11111111-1111-4111-8111-111111111111',id=new ObjectId('6ad94d868ef4abc14cd98feb');
let repository: typeof import('../src/modules/users/repositories/audit.activities.repository.js');
before(async()=>{
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://localhost:27017',SUPABASE_URL:'https://audit-activities.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'});
  repository=await import('../src/modules/users/repositories/audit.activities.repository.js');
});
after(async()=>{await (await import('../src/database/mongodb/client.js')).closeMongoDB()});
const document=(patch:Partial<ActivityDocument>={}):ActivityDocument=>({_id:id,campusId:campus.id,createdByUserId:owner,title:'Actual',description:'Actual description',
  type:'COMMUNITY_ACTIVITY',status:'ACTIVE',visibility:'PUBLIC',startAt:new Date('2026-10-28T12:00:00Z'),endAt:new Date('2026-10-28T13:00:00Z'),
  location:{buildingKey:'h',floorKey:'1'},participantCount:2,createdAt:new Date('2026-10-27T12:00:00Z'),updatedAt:new Date('2026-10-27T13:00:00Z'),...patch});
function change(value:ActivityDocument,patch:Record<string,unknown>={}) {
  const snapshot={title:'Original',description:'Original description',type:value.type,status:'ACTIVE',startAt:value.startAt,endAt:value.endAt,location:value.location};
  return {_id:new ObjectId(),operationId:new ObjectId(),campusId:campus.id,activityId:value._id,actorUserId:owner,revision:1,scope:'ONE' as const,
    changedAt:new Date('2026-10-27T13:00:00Z'),before:snapshot,after:{...snapshot,title:'Actual'},changedFields:['title'],notificationReasons:[],...patch};
}

test('location references resolve identical local keys under each parent and preserve full IDs and provenance',()=>{
  const map:CampusMapDocument={campusId:campus.id,status:'ACTIVE',version:1,createdAt:new Date(),updatedAt:new Date(),buildings:[
    {id:'h',name:'Edificio H',deletedAt:new Date(),floors:[{id:'1',name:'Piso H',isVisible:false,pois:[{poiKey:'sala',name:'Sala H',isVisible:false,deletedAt:new Date()}]}]},
    {id:'b',name:'Edificio B',floors:[{id:'1',name:'Piso B',pois:[{poiKey:'sala',name:'Sala B'}]}]},
  ]};
  const before={campus_id:campus.id,ubicacion:{edificio_clave:'h',piso_clave:'1',poi_clave:'sala'}};
  const after={campus_id:campus.id,ubicacion:{edificio_clave:'b',piso_clave:'1',poi_clave:'sala'}};
  const original=JSON.stringify([before,after,map]),result=auditLocationReferences(campus.id,before,after,map);
  assert.deepEqual(result['datos_antes.ubicacion.piso_clave'],{kind:'floor',id:'1',name:'Piso H',source:'current'});
  assert.deepEqual(result['datos_despues.ubicacion.poi_clave'],{kind:'poi',id:'sala',name:'Sala B',source:'current'});
  assert.equal(result['datos_antes.ubicacion.edificio_clave'].name,'Edificio H');assert.equal(Object.keys(result).length,6);
  assert.equal(JSON.stringify([before,after,map]),original);
});

test('location references never look in another campus, archived map, building or floor; missing IDs stay explicit',()=>{
  const map:CampusMapDocument={campusId:campus.id,status:'ACTIVE',version:1,createdAt:new Date(),updatedAt:new Date(),buildings:[
    {id:'h',name:'Edificio H',floors:[{id:'1',name:'Piso H',pois:[]},{id:'2',name:'Piso 2',pois:[{poiKey:'secret',name:'Wrong floor'}]}]},
    {id:'b',name:'Other building',floors:[{id:'3',name:'Other floor',pois:[{poiKey:'secret',name:'Wrong building'}]}]},
  ]};
  const snapshot={campus_id:campus.id,ubicacion:{edificio_clave:'h',piso_clave:'1',poi_clave:'secret'}};
  const result=auditLocationReferences(campus.id,null,snapshot,map);
  assert.deepEqual(result['datos_despues.ubicacion.poi_clave'],{kind:'poi',id:'secret',name:null,source:'unavailable'});
  for(const unavailable of [null,{...map,campusId:owner},{...map,status:'ARCHIVED' as const}]) {
    const references=auditLocationReferences(campus.id,snapshot,null,unavailable);
    assert.equal(Object.keys(references).length,3);assert.ok(Object.values(references).every(ref=>ref.name===null&&ref.source==='unavailable'));
  }
  assert.ok(Object.values(auditLocationReferences(campus.id,{...snapshot,campus_id:owner},null,map)).every(ref=>ref.name===null));
  const partial=auditLocationReferences(campus.id,null,{campus_id:campus.id,ubicacion:{edificio_clave:'h'}},map);
  assert.equal(Object.keys(partial).length,1);assert.equal(partial['datos_despues.ubicacion.edificio_clave'].name,'Edificio H');
});

test('ambiguous location keys do not invent a name or resolve descendants under an arbitrary parent',()=>{
  const base={id:'h',name:'Edificio H',floors:[{id:'1',name:'Piso H',pois:[{poiKey:'p',name:'POI H'}]}]};
  const map:CampusMapDocument={campusId:campus.id,status:'ACTIVE',version:1,createdAt:new Date(),updatedAt:new Date(),buildings:[base,{...base,name:'Ambiguous'}]};
  const snapshot={campus_id:campus.id,ubicacion:{edificio_clave:'h',piso_clave:'1',poi_clave:'p'}};
  assert.ok(Object.values(auditLocationReferences(campus.id,snapshot,null,map)).every(ref=>ref.name===null));
  map.buildings=[{...base,floors:[base.floors[0],{...base.floors[0],name:'Ambiguous floor'}]}];
  const result=auditLocationReferences(campus.id,snapshot,null,map);assert.equal(result['datos_antes.ubicacion.edificio_clave'].name,'Edificio H');
  assert.equal(result['datos_antes.ubicacion.piso_clave'].name,null);assert.equal(result['datos_antes.ubicacion.poi_clave'].name,null);
});

test('activity audit has stable compound identities and safely projects recorded fields only',()=>{
  const value=document();
  assert.deepEqual(repository.parseActivityAuditId(repository.activityAuditId(id,'created')),{activityId:id.toHexString(),suffix:'created',changeId:undefined});
  for(const key of ['activity:bad:created','activity:'+id.toHexString()+':changed','activity:'+id.toHexString()+':change:bad',owner])assert.equal(repository.parseActivityAuditId(key),null);
  const snapshot=repository.activityAuditSnapshot({title:'Original',description:'Text',type:'COMMUNITY_ACTIVITY',status:'ACTIVE',startAt:value.startAt,
    password:'SECRET',notificationEvents:[{recipientUserIds:[owner]}],location:{buildingKey:'h',floorKey:'1',customLabel:'Sala común',token:'SECRET'},
    endAt:{secret:'SECRET'}},value);
  assert.equal(snapshot?.titulo,'Original');assert.equal(snapshot?.propietario_id,owner);assert.deepEqual(snapshot?.ubicacion,{edificio_clave:'h',piso_clave:'1',referencia:'Sala común'});
  assert.doesNotMatch(JSON.stringify(snapshot),/SECRET|password|notificationEvents|recipientUserIds/);assert.equal(snapshot?.termino_en,undefined);
});

test('creation uses first recorded before state, changes preserve snapshots and legacy deletion is explicit',()=>{
  for(const type of ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT']) {
    const value=document({type,status:'DELETED',visibility:'HIDDEN',deletedAt:new Date('2026-10-27T14:00:00Z'),deletedByUserId:owner});
    const edit=change(value),deletion=change(value,{revision:2,before:edit.after,after:{...edit.after,status:'DELETED',deletedAt:value.deletedAt},changedFields:['status','deletedAt']});
    value.changeHistory=[edit,deletion];const original=JSON.stringify(value);
    const creation=repository.activityAuditDetail(value,repository.activityAuditId(id,'created'),campus)!;
    assert.equal(creation.activity?.snapshotSource,'first_change');assert.equal((creation.datos_despues as any).titulo,'Original');assert.equal(creation.datos_antes,null);
    assert.equal(creation.accion,type==='OFFICIAL_EVENT'?'PUBLICAR_EVENTO_OFICIAL':'CREAR_ACTIVIDAD');
    const changed=repository.activityAuditDetail(value,repository.activityAuditId(id,'change:'+edit._id.toHexString()),campus)!;
    assert.equal(changed.accion,type==='OFFICIAL_EVENT'?'EDITAR_EVENTO_OFICIAL':'EDITAR_ACTIVIDAD');
    assert.equal((changed.datos_antes as any).titulo,'Original');assert.equal((changed.datos_despues as any).titulo,'Actual');
    const removed=repository.activityAuditDetail(value,repository.activityAuditId(id,'change:'+deletion._id.toHexString()),campus)!;
    assert.equal(removed.accion,type==='OFFICIAL_EVENT'?'ELIMINAR_EVENTO_OFICIAL':'ELIMINAR_ACTIVIDAD');assert.equal(removed.activity?.kind,'deleted');
    assert.equal(repository.activityAuditDetail(value,repository.activityAuditId(id,'deleted'),campus),null);
    assert.equal(JSON.stringify(value),original,'No source history/state mutation');
    value.changeHistory=[];
    const legacy=repository.activityAuditDetail(value,repository.activityAuditId(id,'deleted'),campus)!;
    assert.equal(legacy.activity?.snapshotSource,'current');assert.equal(legacy.created_at,value.deletedAt!.toISOString());
  }
});

test('foreign or mislinked embedded changes do not leak; missing first revision is not treated as original creation',()=>{
  const value=document({seriesId:new ObjectId(),occurrenceIndex:2});
  const foreign=change(value,{campusId:owner}),mislinked=change(value,{activityId:new ObjectId()}),gap=change(value,{revision:3});
  value.changeHistory=[foreign,mislinked,gap];
  for(const entry of [foreign,mislinked])assert.equal(repository.activityAuditDetail(value,repository.activityAuditId(id,'change:'+entry._id.toHexString()),campus),null);
  assert.equal(repository.activityAuditDetail(value,repository.activityAuditId(id,'created'),{...campus,id:owner}),null);
  const creation=repository.activityAuditDetail(value,repository.activityAuditId(id,'created'),campus)!;
  assert.equal(creation.activity?.snapshotSource,'current');assert.equal(creation.activity?.occurrenceIndex,2);assert.equal(creation.activity?.seriesId,value.seriesId!.toHexString());
});

test('edit preview names only affected sanitized fields, preserves absent/null/false and groups nested/image differences',()=>{
  const before={updated_at:'old',precio:10,descripcion:null,ubicacion:{edificio:'h',piso:'1'},images:[{id:'photo',nombre_original:'Original'}]},
    after={updated_at:'new',precio:0,descripcion:'',ubicacion:{piso:'1',edificio:'b'},images:[{id:'photo',nombre_original:'Nuevo'}]};
  const original=JSON.stringify([before,after]);
  assert.deepEqual(auditEditSummary(before,after),{complete:true,fields:['precio','descripcion','ubicacion','images','updated_at']});
  assert.equal(JSON.stringify([before,after]),original);
  assert.deepEqual(auditEditSummary({ubicacion:{a:1,b:2}},{ubicacion:{b:2,a:1}}),{complete:true,fields:[]});
  assert.deepEqual(auditEditSummary({deleted_at:null},{estado_publicacion:false}),{complete:true,fields:['deleted_at','estado_publicacion']});
  assert.deepEqual(auditEditSummary(null,after),{complete:false,fields:[]});
  assert.deepEqual(auditEditSummary(before,null),{complete:false,fields:[]});
  assert.deepEqual(auditEditSummary(auditSnapshot({precio:1,password:'old',images:[{id:'photo',storage_path:'old'}]}),auditSnapshot({precio:2,password:'new',images:[{id:'photo',storage_path:'new'}]})),{complete:true,fields:['precio']});
});

test('repeated edits group by concrete activity after filters and before paging, with latest timestamp then ID representative',()=>{
  const pipeline=repository.activityAuditPipeline(campus.id,6,5,'EDITAR_ACTIVIDAD',undefined,undefined,{contentName:'Original'});
  const groups=pipeline.map((row,index)=>row.$group?index:-1).filter(index=>index>=0);assert.equal(groups.length,2);
  const index=groups[1];assert.ok(index>pipeline.findIndex(row=>row.$match?.action));
  assert.deepEqual(pipeline[index-1],{$sort:{at:-1,id:-1}});
  assert.deepEqual(pipeline[index].$group._id,{$cond:[{$eq:['$kind','edited']},{editActivity:'$activityId'},{id:'$id'}]});
  const row={id:'edition',activityId:id,actor:owner,at:new Date(),type:'OFFICIAL_EVENT',name:'Latest',editCount:5};
  assert.deepEqual(repository.activityAuditEntry({...row,kind:'edited'},campus).editGroup,{count:5});
  for(const kind of ['created','deleted'])assert.equal(repository.activityAuditEntry({...row,kind},campus).editGroup,undefined);
  const value=document({seriesId:new ObjectId()}),first=change(value,{_id:new ObjectId('000000000000000000000001'),changedAt:new Date('2026-10-27T15:00:00Z')}),older=change(value,{_id:new ObjectId('ffffffffffffffffffffffff')});
  value.changeHistory=[older,first,change(value,{campusId:owner}),change(value,{activityId:new ObjectId()}),change(value,{after:{...first.after,status:'DELETED'}})];
  const result=repository.activityEditHistory(value,campus,1,0);assert.equal(result.total,2);assert.ok(result.data[0].id.endsWith(first._id.toHexString()));
  assert.ok(repository.activityEditHistory(value,campus,1,1).data[0].id.endsWith(older._id.toHexString()));
  assert.deepEqual(repository.activityEditHistory(value,{...campus,id:owner},5,0),{data:[],total:0});
});

test('Mongo audit total uses the same scoped, filtered and grouped events as the list without pagination or writes',async()=>{
  const from='2026-10-27T03:00:00.000Z',before='2026-10-28T03:00:00.000Z';let total=7;
  const mocked=mock.method(Db.prototype,'collection',(name:string)=>{
    assert.equal(name,'activities');return {aggregate:(pipeline:any[])=>{
      assert.deepEqual(pipeline.slice(0,-1),repository.activityAuditPipeline(campus.id,20,40,'PUBLICAR_EVENTO_OFICIAL',from,before).slice(0,-3));
      assert.deepEqual(pipeline.at(-1),{$count:'total'});
      assert.ok(!pipeline.some(stage=>stage.$skip!==undefined||stage.$limit!==undefined||stage.$out||stage.$merge));
      return {toArray:async()=>total?[{total}]:[]};
    }};
  });
  try{
    assert.equal(await repository.countActivityAudit(campus,'PUBLICAR_EVENTO_OFICIAL',from,before),7);
    total=0;assert.equal(await repository.countActivityAudit(campus,'PUBLICAR_EVENTO_OFICIAL',from,before),0);
  }finally{mocked.mock.restore()}
});

test('Mongo pipeline scopes root and embedded history, filters actions/dates before sort/skip/limit, and suppresses duplicate deletion',()=>{
  const pipeline=repository.activityAuditPipeline(campus.id,11,10,'EDITAR_ACTIVIDAD','2026-10-27T03:00:00.000Z','2026-10-28T03:00:00.000Z');
  assert.deepEqual(pipeline[0],{$match:{campusId:campus.id,type:{$in:['COMMUNITY_ACTIVITY','OFFICIAL_EVENT']}}});
  const match=pipeline.find(row=>row.$match?.action);assert.equal(match?.$match.action,'EDITAR_ACTIVIDAD');
  assert.deepEqual(match?.$match.at,{$type:'date',$gte:new Date('2026-10-27T03:00:00Z'),$lt:new Date('2026-10-28T03:00:00Z')});
  assert.deepEqual(pipeline.slice(-3),[{$sort:{at:-1,id:-1}},{$skip:10},{$limit:11}]);
  const changes=pipeline[1].$set.auditChanges.$filter.cond.$and;
  assert.ok(changes.some((row:any)=>JSON.stringify(row)==='{"$eq":["$$change.campusId","$campusId"]}'));
  assert.ok(changes.some((row:any)=>JSON.stringify(row)==='{"$eq":["$$change.activityId","$_id"]}'));
  const serialized=JSON.stringify(pipeline);
  assert.ok(serialized.includes('$auditChanges'));assert.ok(serialized.includes('$$change.after.deletedAt'));
  assert.ok(!pipeline.some(stage=>Object.hasOwn(stage,'$out')||Object.hasOwn(stage,'$merge')));
  assert.doesNotMatch(serialized,/notificationEvents|createCollection|notificationReasons/);
});

test('Mongo name search escapes literal text, matches old/new titles within whole series and uses only scoped users existing at event time',()=>{
  const search={contentName:'100%_[Taller].*',userName:'Carlos',users:[{id:owner,createdAt:Date.parse('2026-10-27T12:00:00.001Z')}]};
  const pipeline=repository.activityAuditPipeline(campus.id,20,20,undefined,undefined,undefined,search);
  const group=pipeline.find(stage=>stage.$group)!.$group;
  assert.deepEqual(group.seriesCount,{$sum:1},'Name filtering never reduces series occurrence count');
  const matches=group.matchingName.$max.$cond[0].$or;
  for(const matcher of matches){
    const expression=matcher.$regexMatch;
    assert.equal(expression.options,'i');const pattern=new RegExp(expression.regex,'i');
    assert.ok(pattern.test('100%_[taller].*'));assert.ok(!pattern.test('100%_TallerAnything'));
  }
  assert.deepEqual(matches.map((item:any)=>item.$regexMatch.input.$cond[1]),['$name','$previousName']);
  const matchIndex=pipeline.findIndex(stage=>stage.$match?.matchingName===1),groupIndex=pipeline.findIndex(stage=>stage.$group);
  assert.ok(matchIndex>groupIndex&&matchIndex<pipeline.findIndex(stage=>stage.$skip));
  assert.deepEqual(pipeline[matchIndex].$match.actor,{$in:[owner]});
  assert.deepEqual(pipeline[matchIndex].$match.$or,[{actor:owner,at:{$gte:new Date(search.users[0].createdAt)}}]);
  const empty=repository.activityAuditPipeline(campus.id,20,0,undefined,undefined,undefined,{userName:'Unknown',users:[]}).find(stage=>stage.$match?.actor);
  assert.deepEqual(empty?.$match.actor,{$in:[]});assert.equal(empty?.$match.$or,undefined);
});

test('only creation groups by exact series, actor, type and timestamp before filters and pagination; representative retains an occurrence identity',()=>{
  const pipeline=repository.activityAuditPipeline(campus.id,20,20,'PUBLICAR_EVENTO_OFICIAL');
  const eligible=pipeline.find(stage=>stage.$set?.groupedCreation)!.$set.groupedCreation.$and;
  assert.deepEqual(eligible[0],{$eq:['$kind','created']});assert.deepEqual(eligible[1],{$eq:[{$type:'$seriesId'},'objectId']});
  assert.deepEqual(eligible[3],{$eq:[{$type:'$at'},'date']});assert.ok(eligible[2].$regexMatch.regex.test(owner));
  const grouping=pipeline.findIndex(stage=>stage.$group),filter=pipeline.findIndex(stage=>stage.$match?.action);
  assert.ok(grouping>0&&grouping<filter&&filter<pipeline.findIndex(stage=>stage.$skip));
  assert.deepEqual(pipeline[grouping-1],{$sort:{id:-1}});
  assert.deepEqual(pipeline[grouping].$group._id,{$cond:['$groupedCreation',{seriesId:'$seriesId',actor:'$actor',type:'$type',at:'$at'},{id:'$id'}]});
  const value=document({seriesId:new ObjectId()});
  for(const type of ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT']){
    const row={id:repository.activityAuditId(id,'created'),activityId:id,at:value.createdAt,actor:owner,type,kind:'created',seriesId:value.seriesId,seriesCount:12};
    const entry=repository.activityAuditEntry(row,campus);assert.equal(entry.entidad_id,id.toHexString());assert.deepEqual(entry.activitySeries,{seriesId:value.seriesId!.toHexString(),count:12});
    assert.equal(repository.activityAuditEntry({...row,kind:'edited'},campus).activitySeries,undefined);
    assert.equal(repository.activityAuditEntry({...row,seriesCount:undefined},campus).activitySeries,undefined);
  }
});

test('administrative occurrences use the same exact creation scope, retain hidden/past/deleted states and expose only safe current summary fields',async()=>{
  const value=document({seriesId:new ObjectId(),occurrenceIndex:2,status:'DELETED',visibility:'HIDDEN'}),original=JSON.stringify(value);
  const filter=repository.auditSeriesFilter(campus,value)!;
  assert.deepEqual(filter,{campusId:campus.id,seriesId:value.seriesId,createdByUserId:owner,type:value.type,createdAt:value.createdAt});
  for(const patch of [{seriesId:undefined},{createdAt:new Date('invalid')},{createdByUserId:'wrong'},{campusId:owner},{type:'OTHER'}])assert.equal(repository.auditSeriesFilter(campus,document({...value,...patch} as any)),null);
  const summary=repository.auditOccurrence({...value,notificationEvents:[{secret:'DO NOT EXPOSE'}]} as any);
  assert.equal(summary.status,'DELETED');assert.equal(summary.visibility,'HIDDEN');assert.equal(summary.index,2);assert.equal(summary.activityId,id.toHexString());
  assert.doesNotMatch(JSON.stringify(summary),/DO NOT EXPOSE|notificationEvents|changeHistory|createdByUserId/);
  assert.equal(repository.auditOccurrence({...value,startAt:new Date('invalid'),title:null} as any).startAt,null);
  let reads=0;
  const mocked=mock.method(Db.prototype,'collection',(name:string)=>{
    assert.equal(name,'activities');return {aggregate:(pipeline:any[])=>{
      reads++;assert.deepEqual(pipeline[0],{$match:filter});
      assert.deepEqual(pipeline[1].$facet.count,[{$count:'total'}]);
      assert.deepEqual(pipeline[1].$facet.rows.slice(1,3),[{$skip:5},{$limit:6}]);
      assert.deepEqual(Object.keys(pipeline[1].$facet.rows[3].$project).sort(),['_id','endAt','occurrenceIndex','startAt','status','title','visibility'].sort());
      return {toArray:async()=>[{count:[{total:12}],rows:[value]}]};
    }};
  });
  try{
    const result=await repository.listAuditOccurrences(campus,value,6,5);assert.equal(result.total,12);assert.deepEqual(result.occurrences,[summary]);
    assert.deepEqual(await repository.listAuditOccurrences(campus,document(),6,5),{total:0,occurrences:[]});assert.equal(reads,1);
  }finally{mocked.mock.restore()}
  assert.equal(JSON.stringify(value),original);
});

test('bounded merge keeps SQL microseconds and global ID ties across pages and batches',async()=>{
  const entry=(index:number,prefix:string):AuditEntry=>({id:prefix+String(index).padStart(4,'0'),actor_usuario_id:owner,campus_id:campus.id,institucion_id:campus.institucion_id,
    entidad_tipo:'actividad',entidad_id:id.toHexString(),accion:'CREAR_ACTIVIDAD',created_at:new Date(Date.UTC(2026,9,27,12,0,index)).toISOString()});
  const sql=Array.from({length:107},(_,i)=>entry(i,'sql:')),mongo=Array.from({length:108},(_,i)=>entry(i,'activity:'));
  sql.push({...entry(40,'micro:'),created_at:'2026-10-27T12:00:40.000001Z'});
  sql.sort(compareAuditEntries);mongo.sort(compareAuditEntries);const expected=[...sql,...mongo].sort(compareAuditEntries);
  const calls:number[]=[];
  for(const page of [1,5,11,12,100000]) {
    const result=await auditTimeline({page,limit:20,offset:(page-1)*20},async(limit,offset)=>{calls.push(limit);return sql.slice(offset,offset+limit)},async(limit,offset)=>{calls.push(limit);return mongo.slice(offset,offset+limit)});
    assert.deepEqual(result.data,expected.slice((page-1)*20,page*20));assert.equal(result.meta.hasMore,expected.length>page*20);
  }
  assert.ok(calls.every(limit=>limit===100));
  const micro=expected.findIndex(row=>row.id==='micro:0040');assert.equal(expected[micro+1].created_at,'2026-10-27T12:00:40.000Z');
});

test('Mongo reader uses only approved scoped collections and history includes JOINED/LEFT but never views',async()=>{
  const calls:{name:string;filter:unknown}[]=[];const value=document();
  const event={_id:new ObjectId(),userId:owner,type:'LEFT',occurredAt:new Date('2026-10-27T12:00:00Z'),provenance:'LEGACY_STATE',eventKey:'secret key'};
  const mocked=mock.method(Db.prototype,'collection',(name:string)=>{
    assert.ok(['activities','activity_participation','activity_interactions'].includes(name));
    return {
      findOne:async(filter:unknown)=>{calls.push({name,filter});return value},
      aggregate:(pipeline:unknown)=>{calls.push({name,filter:pipeline});return {toArray:async()=>name==='activity_participation'?[{joined:2,left:1,incomplete:1}]:[]}},
      find:(filter:unknown)=>{calls.push({name,filter});const cursor={sort:(order:unknown)=>{assert.deepEqual(order,{occurredAt:-1,_id:-1});return cursor},skip:(offset:number)=>{assert.equal(offset,10);return cursor},
        limit:(limit:number)=>{assert.equal(limit,11);return cursor},toArray:async()=>[event]};return cursor},
    };
  });
  try {
    await repository.findAuditActivity(campus,id.toHexString());await repository.listActivityAudit(campus,11,10);
    const result=await repository.activityAuditParticipation(campus,id.toHexString(),11,10);
    assert.deepEqual(result.summary,{joined:2,left:1,historyIncomplete:true});assert.equal(result.events[0].provenance,'LEGACY_STATE');assert.doesNotMatch(JSON.stringify(result),/secret key|eventKey/);
    const find=calls.find(row=>row.name==='activity_interactions')!.filter as any;
    assert.equal(find.campusId,campus.id);assert.ok(find.activityId.equals(id));assert.deepEqual(find.type,{$in:['JOINED','LEFT']});
    const root=calls.find(row=>row.name==='activities')!.filter as any;assert.equal(root.campusId,campus.id);assert.ok(root._id.equals(id));
  } finally {mocked.mock.restore()}
});
