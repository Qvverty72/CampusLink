import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Db } from 'mongodb';
import { accountCapabilities, requireCampusCapability, requireResourceOwner } from '../src/modules/auth/auth.authorization.js';
import type { CampusCapability } from '../src/modules/auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';

const userId='11111111-1111-4111-8111-111111111111',campus='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333', token='authorization.test.token', key='sb_secret_test';
const originalFetch=globalThis.fetch;
const context = (): VerifiedAuthConnection => ({userId,campusId:campus,roles:[],permissions:[],profile:{id:userId,
  campus_id:campus,institucion_id:campus,nombre_completo:'User',foto_path:null,verificado_en:'2026-10-09T12:00:00Z',estado_cuenta:'ACTIVA',deleted_at:null}});
const role=(name:string,at=campus)=>({id:name,name,campusId:at});
const permission=(name:string,at=campus)=>({id:name,name,campusId:at});
let server:Server,base:string,authStatus:number,activeCampus:boolean, mongoReads:number;
let current:VerifiedAuthConnection,doc:CampusMapDocument|null,providerFailure:boolean,providerCalls:string[];
before(async () => {
  Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:'mongodb://localhost:27017',SUPABASE_URL:'https://authorization-test.invalid',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:key});
  mock.method(Db.prototype,'collection',(name:string)=>{
    assert.equal(name,'campus_maps');
    return {findOne:async (filter:unknown)=>{mongoReads++;assert.deepEqual(filter,{campusId:current.campusId,status:'ACTIVE'});return doc;}};
  });
  globalThis.fetch=async (input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    assert.equal(url.origin,'https://authorization-test.invalid');providerCalls.push(url.pathname);
    const secret=url.pathname.endsWith('/campus'),headers=new Headers(init?.headers);
    assert.equal(headers.get('authorization'),'Bearer '+(secret?key:token));
    assert.equal(headers.get('apikey'),secret?key:'sb_publishable_test');
    if(url.pathname==='/auth/v1/user')return authStatus===200?Response.json({id:userId,email:'qa@duocuc.cl',email_confirmed_at:'2026-10-09T12:00:00Z',
      user_metadata:{roles:['ADMINISTRADOR'],campus_id:other}}):Response.json({code:'bad_jwt',msg:'private token'},{status:authStatus});
    if(providerFailure)throw new Error('private PostgreSQL transport credentials');
    if(secret){assert.equal(url.searchParams.get('id'),'eq.'+current.campusId);assert.equal(url.searchParams.get('activo'),'eq.true');return Response.json(activeCampus?[{id:current.campusId}]:[]);}
    if(url.pathname.endsWith('/perfil_usuario')){assert.equal(url.searchParams.get('id'),'eq.'+userId);return Response.json([current.profile]);}
    assert.equal(url.searchParams.get('perfil_usuario_id'),'eq.'+userId);assert.equal(url.searchParams.get('revocado_en'),'is.null');
    const kind=url.pathname.endsWith('/usuario_rol')?'rol':'permiso';
    return Response.json((kind==='rol'?current.roles:current.permissions).map(row=>({campus_id:row.campusId,[kind]:{id:row.id,nombre:row.name}})));
  };
  const {createApp}=await import('../src/app.js');
  server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  base='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/v1';
});
beforeEach(()=>{
  current=context();authStatus=200;activeCampus=true;providerFailure=false;mongoReads=0;providerCalls=[];
  doc={campusId:campus,status:'ACTIVE',version:1,buildings:[],createdAt:new Date(),updatedAt:new Date()};
});
after(async()=>{
  globalThis.fetch=originalFetch;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  mock.restoreAll();const {closeMongoDB}=await import('../src/database/mongodb/client.js');await closeMongoDB();
});
const request=(at=campus,authorization='Bearer '+token)=>originalFetch(base+'/maps/'+at+'/active',{headers:{Authorization:authorization}});

test('all eight authorized permission combinations remain independent on the server',()=>{
  const names=['PUBLICAR_EVENTO','ACCEDER_ANALITICA','ACCEDER_REPORTERIA'];
  const capabilities=['officialActivities','analytics','reports'] as const;
  for(let mask=0;mask<8;mask++){
    const auth=context();auth.roles=[role('USUARIO_AUTORIZADO')];auth.permissions=names.filter((_,i)=>mask&(1<<i)).map(name=>permission(name));
    requireCampusCapability(auth,campus,'general');
    for(let i=0;i<3;i++){
      if(mask&(1<<i))requireCampusCapability(auth,campus,capabilities[i]);
      else assert.throws(()=>requireCampusCapability(auth,campus,capabilities[i]),{status:403});
    }
  }
});
test('verified account, unknown roles, isolated permission and wrong-campus grants never imply special access',()=>{
  const auth=context();requireCampusCapability(auth,campus,'general');
  assert.throws(()=>requireCampusCapability(auth,other,'general'),{status:403});
  for(const roles of [[],[role('UNRECOGNIZED')],[role('USUARIO_AUTORIZADO',other)]]){
    auth.roles=roles;auth.permissions=[permission('ACCEDER_REPORTERIA')];
    assert.throws(()=>requireCampusCapability(auth,campus,'reports'),{status:403});
    assert.throws(()=>requireCampusCapability(auth,campus,'administration'),{status:403});
  }
  auth.roles=[role('USUARIO_AUTORIZADO')];auth.permissions=[permission('PUBLICAR_EVENTO',other)];
  assert.throws(()=>requireCampusCapability(auth,campus,'officialActivities'),{status:403});
  assert.throws(()=>requireCampusCapability(auth,campus,'unknown' as CampusCapability),{status:403});
});
test('administrator has all capabilities only within explicitly granted campus; owner remains an independent condition',()=>{
  const auth=context();auth.roles=[role('ADMINISTRADOR',other)];
  for(const capability of ['general','officialActivities','analytics','reports','administration'] as const)requireCampusCapability(auth,other,capability);
  assert.throws(()=>requireCampusCapability(auth,campus,'administration'),{status:403});
  assert.throws(()=>requireCampusCapability(auth,campus,'analytics'),{status:403});
  requireResourceOwner(auth,userId);
  assert.throws(()=>requireResourceOwner(auth,other),{status:403});
  assert.equal(accountCapabilities(auth).analytics,false);
});
test('inactive or mismatched account cannot pass any read/write/deactivation policy or ownership check',()=>{
  for(const change of [{estado_cuenta:'SUSPENDIDA'},{estado_cuenta:'DESACTIVADA'},{deleted_at:'2026-10-09T12:00:00Z'},{id:other}] as const){
    const auth=context();Object.assign(auth.profile,change);auth.roles=[role('ADMINISTRADOR')];
    for(const capability of ['general','officialActivities','analytics','reports','administration'] as const)
      assert.throws(()=>requireCampusCapability(auth,campus,capability),{status:403});
    assert.throws(()=>requireResourceOwner(auth,userId),{status:403});
  }
});
test('HTTP map requires a valid credential before campus validation or data lookup',async()=>{
  assert.equal((await request(campus,'')).status,401);
  assert.equal((await request('bad','')).status,401);
  assert.equal(providerCalls.length,0);assert.equal(mongoReads,0);
  authStatus=401;assert.equal((await request()).status,401);assert.equal(mongoReads,0);
  authStatus=200;assert.equal((await request('bad')).status,400);assert.equal(mongoReads,0);
});
test('HTTP own-campus map succeeds with verified account and Mongo query is scoped before returning the unchanged DTO',async()=>{
  const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.data.campusId,campus);assert.equal(body.data.status,'ACTIVE');assert.equal(mongoReads,1);
  assert.ok(providerCalls.includes('/rest/v1/campus'));
  const upper=await request(campus.toUpperCase());assert.equal(upper.status,200);
});
test('changing a route/body/query cannot select another campus or transfer an assigned privilege',async()=>{
  current.roles=[role('ADMINISTRADOR',other)];
  assert.equal((await request(other)).status,403);assert.equal(mongoReads,0);
  const response=await originalFetch(base+'/maps/'+campus+'/active?campusId='+other,{headers:{Authorization:'Bearer '+token}});
  assert.equal(response.status,200);assert.equal((await response.json()).data.campusId,campus);
});
test('revoked role, suspended account and deactivated account are effective with the same token on subsequent requests',async()=>{
  current.profile.verificado_en=null;current.roles=[role('ADMINISTRADOR')];
  assert.equal((await request()).status,200);
  current.roles=[];const reads=mongoReads;assert.equal((await request()).status,403);assert.equal(mongoReads,reads);
  current.roles=[role('ADMINISTRADOR')];
  for(const state of ['SUSPENDIDA','DESACTIVADA'] as const){current.profile.estado_cuenta=state;assert.equal((await request()).status,403);assert.equal(mongoReads,reads);}
});
test('profile campus change denies the old map and scopes the next read to the current campus',async()=>{
  assert.equal((await request()).status,200);
  current.campusId=other;current.profile.campus_id=other;doc={...doc!,campusId:other};
  assert.equal((await request(campus)).status,403);
  const response=await request(other);assert.equal(response.status,200);assert.equal((await response.json()).data.campusId,other);
});
test('actual foreign/archived document, absent map and inactive PostgreSQL campus are never exposed',async()=>{
  for(const value of [null,{...doc!,campusId:other,buildings:[{name:'FOREIGN_SECRET'}]},{...doc!,status:'ARCHIVED' as const}]){
    doc=value;const response=await request();assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/FOREIGN_SECRET/);
  }
  const reads=mongoReads;activeCampus=false;assert.equal((await request()).status,404);assert.equal(mongoReads,reads);
});
test('provider outage returns sanitized error and metadata cannot inject administrator access',async()=>{
  current.profile.verificado_en=null;assert.equal((await request()).status,403);assert.equal(mongoReads,0);
  current.profile.verificado_en='2026-10-09T12:00:00Z';providerFailure=true;
  const response=await request();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private|credentials|token/);assert.equal(mongoReads,0);
});
test('unimplemented business operations remain unavailable without inventing CRUD endpoints',async()=>{
  for(const method of ['POST','PATCH','DELETE']){
    const response=await originalFetch(base+'/maps/'+campus+'/active',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({campusId:other})});
    assert.equal(response.status,404);assert.equal(mongoReads,0);
  }
  for(const path of ['/analytics','/reports','/marketplace/physicalgoods','/marketplace/elibrary'])assert.equal((await originalFetch(base+path)).status,404);
});
