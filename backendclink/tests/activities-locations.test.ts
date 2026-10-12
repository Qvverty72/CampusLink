import './helpers/activity-integrity.js';
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { ObjectId } from 'mongodb';
import { parseCreateActivity } from '../src/modules/activities/activities.create.validation.js';
import { resolveActivityLocation, spatialBuildings } from '../src/modules/activities/activities.location.js';
import { toVisibleActivity } from '../src/modules/activities/activities.policy.js';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivitySeriesDocument, CreateActivityInput, CreateActivitySeriesInput } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { activityLocationLabel, filterLocationActivities } from '../../frontendclink/src/features/activities/types/activity.js';
import { activityEditDraft, validateActivityEditDraft } from '../../frontendclink/src/features/activities/types/editing.js';
import { validateActivityDraft } from '../../frontendclink/src/features/activities/types/creation.js';

const campusId='22222222-2222-4222-8222-222222222222',userId='11111111-1111-4111-8111-111111111111';
const now=new Date('2099-01-01T00:00:00Z');
const auth: VerifiedAuthConnection = {userId,campusId,roles:[],permissions:[],profile:{id:userId,campus_id:campusId,institucion_id:campusId,
  nombre_completo:'Creator',foto_path:null,verificado_en:now.toISOString(),estado_cuenta:'ACTIVA',deleted_at:null}};
const map: CampusMapDocument={campusId,status:'ACTIVE',version:1,createdAt:now,updatedAt:now,buildings:[
  {id:'building',name:'Building',floors:[{id:'floor',name:'Floor',pois:[{poiKey:'poi',name:'POI',isVisible:true},
    {poiKey:'hidden',name:'Hidden',isVisible:false},{poiKey:'deleted',name:'Deleted',isVisible:true,deletedAt:now}]},
    {id:'inactiveFloor',name:'Inactive',isVisible:false,pois:[]}]},
  {id:'inactiveBuilding',name:'Inactive',isVisible:false,floors:[]},{id:'emptyBuilding',name:'Empty',floors:[]},
]};
const catalog=[{id:'building',name:'Building',floors:[{id:'floor',name:'Floor',pois:[{id:'poi',name:'POI'}]}]},
  {id:'emptyBuilding',name:'Empty',floors:[]}];
const body=(location: object)=>({title:'Activity',description:'Description',startAt:'2099-01-05T12:00:00.000Z',endAt:'2099-01-05T13:00:00.000Z',location});
const parse=(location: object): CreateActivityInput => {
  const result=parseCreateActivity(body(location)); assert.equal(result.success,true); return (result as {data:CreateActivityInput}).data;
};
const document=(location: CreateActivityInput['location']): ActivityDocument => ({_id:new ObjectId(),campusId,createdByUserId:userId,
  ...parse(location),type:'COMMUNITY_ACTIVITY',status:'ACTIVE',visibility:'PUBLIC',participantCount:1,createdAt:now,updatedAt:now});
let create: typeof import('../src/modules/activities/activities.create.service.js').createCommunityActivity;
let list: typeof import('../src/modules/activities/activities.service.js').getActivities;
let detail: typeof import('../src/modules/activities/activities.detail.service.js').getActivityDetail;
let previewEdit: typeof import('../src/modules/activities/activities.edit.service.js').previewActivityEdit;
let seriesService: typeof import('../src/modules/activities/activities.series.service.js');
before(async()=>{
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://localhost:27017',SUPABASE_URL:'https://locations-test.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'});
  ({createCommunityActivity:create}=await import('../src/modules/activities/activities.create.service.js'));
  ({getActivities:list}=await import('../src/modules/activities/activities.service.js'));
  ({getActivityDetail:detail}=await import('../src/modules/activities/activities.detail.service.js'));
  ({previewActivityEdit:previewEdit}=await import('../src/modules/activities/activities.edit.service.js'));
  seriesService=await import('../src/modules/activities/activities.series.service.js');
});
const levels=[['CAMPUS',{}],['BUILDING',{buildingKey:'building'}],['FLOOR',{buildingKey:'building',floorKey:'floor'}],
  ['POI',{buildingKey:'building',floorKey:'floor',poiKey:'poi'}]] as const;
for(const [level,location] of levels){
  test(`${level}: creation, list, detail, edit and frontend retain the actual hierarchy`,async()=>{
    let saved!:ActivityDocument;
    const deps={now:()=>now,getActiveMap:async()=>map,createActivity:async(d:ActivityDocument)=>{
      saved=d;return toVisibleActivity(d,campusId,now,spatialBuildings(map))!;
    },findActivities:async()=>[saved],findActivity:async()=>saved,findParticipation:async()=>null};
    const created=await create(auth,parse(location),deps);
    assert.deepEqual(saved.location,location); assert.equal(saved.createdByUserId,userId); assert.ok(saved._id instanceof ObjectId);
    assert.deepEqual((await list(auth,{},deps))[0].location,created.location);
    const dto=await detail(auth,saved._id.toHexString(),deps); assert.deepEqual(dto.location,created.location);
    const plan=await previewEdit(auth,saved._id.toHexString(),{...parse(location),title:'Edit',scope:'ONE',expectedRevision:0},
      {...deps,findEditable:async()=>saved});
    assert.deepEqual(plan.changes[0].after.location,location);
    const draft=activityEditDraft(dto); assert.ok(validateActivityDraft(draft,catalog,0).input);
    assert.ok(validateActivityEditDraft(draft,dto,catalog,'ONE').input);
    assert.equal(activityLocationLabel(dto.location),level==='CAMPUS'?'Campus':level==='BUILDING'?'Building':'Building · Floor');
    assert.equal(filterLocationActivities([created],{floorKey:'floor'},now.getTime()).length,['FLOOR','POI'].includes(level)?1:0);
    assert.equal(filterLocationActivities([created],{buildingKey:'building'},now.getTime()).length,level==='CAMPUS'?0:1);
  });
  test(`${level}: recurring creation and browsing preserve level without fabricated spatial references`,async()=>{
    let series!:ActivitySeriesDocument,occurrences:ActivityDocument[]=[];
    const input:CreateActivitySeriesInput={...parse(location),recurrence:{frequency:'DAILY',interval:1,until:'2099-01-07',timeZone:'UTC',excludedDates:[]}};
    const deps={now:()=>now,getActiveMap:async()=>map,createSeries:async(s:ActivitySeriesDocument,docs:ActivityDocument[])=>{
      series=s;occurrences=docs;return docs.map(d=>toVisibleActivity(d,campusId,now,spatialBuildings(map))!);
    },findSeries:async()=>series,findSeriesOccurrences:async()=>occurrences};
    const preview=await seriesService.previewActivitySeries(auth,input,deps);
    const result=await seriesService.createActivitySeries(auth,{...input,previewHash:preview.previewHash},deps);
    assert.equal(result.series.occurrenceCount,3); assert.ok(occurrences.every(d=>JSON.stringify(d.location)===JSON.stringify(location)&&d.creatorVersion));
    assert.equal((await seriesService.getActivitySeries(auth,series._id.toHexString(),deps)).occurrences.length,3);
  });
}
test('invalid hierarchies, empty IDs, null building/floor, unknown location fields and campus injection are rejected',()=>{
  for(const location of [{floorKey:'floor'},{poiKey:'poi'},{buildingKey:'building',poiKey:'poi'},
    {buildingKey:''},{floorKey:null},{buildingKey:null},{campusId},{buildingKey:'building',floorKey:'otherCampusFloor'}]){
    if('floorKey' in location && location.floorKey==='otherCampusFloor'){
      assert.equal(resolveActivityLocation(spatialBuildings(map),location),null); continue;
    }
    assert.equal(parseCreateActivity(body(location)).success,false);
  }
});
test('inactive or absent buildings/floors/POIs remain hidden, while unrelated floor and campus locations survive',async()=>{
  for(const location of [{buildingKey:'inactiveBuilding'},{buildingKey:'missing'},
    {buildingKey:'building',floorKey:'inactiveFloor'},{buildingKey:'building',floorKey:'missing'},
    {buildingKey:'building',floorKey:'floor',poiKey:'hidden'},{buildingKey:'building',floorKey:'floor',poiKey:'deleted'},
    {buildingKey:'building',floorKey:'floor',poiKey:'missing'}]){
    assert.equal(toVisibleActivity(document(location),campusId,now,spatialBuildings(map)),null);
    await assert.rejects(create(auth,parse(location),{now:()=>now,getActiveMap:async()=>map,createActivity:async()=>{throw Error('must not write');}}),{status:400});
  }
  for(const location of [{},{buildingKey:'emptyBuilding'},{buildingKey:'building',floorKey:'floor'}]){
    assert.ok(toVisibleActivity(document(location),campusId,now,spatialBuildings(map)));
  }
  const foreign={...map,campusId:'33333333-3333-4333-8333-333333333333'};
  for(const [,location] of levels)await assert.rejects(create(auth,parse(location),{getActiveMap:async()=>foreign,now:()=>now}),{status:404});
});
