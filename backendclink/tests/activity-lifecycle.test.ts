import assert from 'node:assert/strict';
import { before, after, beforeEach, mock, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { Db, ObjectId } from 'mongodb';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID();
const initialVersion = '2026-10-12T12:00:00.123456Z';
const now = new Date('2026-10-12T13:00:00Z');
let documents: ActivityDocument[] = [], mongoFailure = false, partialFailure = false, ackFailure = false, acknowledged = true;
let roles: Record<string,string>, permissionId: string;
let getActivities: typeof import('../src/modules/activities/activities.service.js').getActivities;
let getDetail: typeof import('../src/modules/activities/activities.detail.service.js').getActivityDetail;
let updateProfile: typeof import('../src/modules/users/users.service.js').updateAcademicProfile;
let updateState: typeof import('../src/modules/users/access.service.js').updateAccountState;
let getAccess: typeof import('../src/modules/users/access.service.js').getUserAccess;
let dispatch: typeof import('../src/modules/activities/activities.lifecycle.worker.js').dispatchCreatorChanges;
let integrity: typeof import('../src/modules/activities/activities.integrity.js').activityIntegrity;
let lifecycle: typeof import('../src/modules/activities/activities.lifecycle.repository.js');
let closePostgres: () => Promise<void>;
const migration = () => readFile('src/database/supabase/migrations/20261012184623_f2_2_06_activity_creator_lifecycle.sql','utf8');
const map: CampusMapDocument = { campusId: campus, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'building', name: 'Building', floors: [{ id: 'floor', name: 'Floor', pois: [] }] }] };
const doc = (creator: string, type = 'COMMUNITY_ACTIVITY'): ActivityDocument => ({
  _id: new ObjectId(), campusId: campus, createdByUserId: creator, creatorVersion: initialVersion,
  title: 'Original', description: 'Historical', type, status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2099-10-13T12:00:00Z'), endAt: new Date('2099-10-13T13:00:00Z'),
  location: { buildingKey: 'building', floorKey: 'floor' }, participantCount: 1, createdAt: now, updatedAt: now,
});
const dependencies = () => ({ now: () => now, getActiveMap: async () => map,
  findActivities: async () => documents, findActivity: async (_: string,id: string) => documents.find(d => d._id.toHexString() === id) ?? null,
  findParticipation: async () => null, findOrganizer: async () => ({ name: 'Historical organizer' }) });

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://lifecycle-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test',
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@lifecycle-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => ({ release() {}, query(sql: string, params: unknown[] = []) {
    if (ackFailure && sql.startsWith('UPDATE campuslink_private')) throw new Error('private acknowledgement failure');
    return db.query(sql, params);
  } }));
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql','utf8');
  for (const name of ['institucion','campus','carrera','campus_carrera','perfil_usuario','usuario_carrera','rol','permiso','rol_permiso',
    'usuario_rol','usuario_permiso','publicacion_recurso','recurso_digital','archivo_publicacion','mensaje_solicitud','solicitud_recurso',
    'transaccion_recurso','acceso_recurso_digital','reporte_contenido','auditoria']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.'+name+' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql,name); await db.exec(sql);
  }
  for (const file of ['f2_3_01_autenticacion','f2_3_04_perfil_academico','f2_3_05_roles_permisos','f2_3_07_estado_cuenta','f2_3_08_auditoria']) {
    await db.exec(await readFile('src/database/supabase/migrations/'+file+'.sql','utf8'));
  }
  await db.exec(await migration());
  await db.query('INSERT INTO institucion(id,nombre) VALUES ($1,\'Test\')',[institution]);
  await db.query('INSERT INTO campus(id,institucion_id,nombre) VALUES ($1,$2,\'Home\'),($3,$2,\'Other\')',[campus,institution,otherCampus]);
  roles = Object.fromEntries((await db.query<{ id:string;nombre:string }>('SELECT id,nombre FROM rol')).rows.map(r => [r.nombre,r.id]));
  permissionId = (await db.query<{ id:string }>("SELECT id FROM permiso WHERE nombre='PUBLICAR_EVENTO'")).rows[0].id;
  globalThis.fetch = async (input,init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin,'https://lifecycle-test.invalid');
    assert.equal(new Headers(init?.headers).get('apikey'),'sb_secret_test');
    const table = url.pathname.split('/').at(-1); assert.ok(['campus','perfil_usuario'].includes(table!));
    const id = url.searchParams.get('id')!.slice(3);
    const rows = await db.query(`SELECT ${url.searchParams.get('select')} FROM public.${table} WHERE id=$1`,[id]);
    return Response.json(rows.rows[0] ?? null);
  };
  mock.method(Db.prototype,'collection', (name: string) => {
    assert.equal(name,'activities');
    return { updateMany: async (filter: any,update: any,options: any) => {
      assert.equal(filter.type,'COMMUNITY_ACTIVITY'); assert.equal(filter.status,'ACTIVE');
      assert.deepEqual(options.writeConcern,{w:'majority'});
      if (mongoFailure) throw new Error('private Mongo failure');
      let modifiedCount = 0;
      for (const d of documents) {
        const version = filter.$or[0].creatorVersion.$lte;
        const eligible = d.creatorVersion !== undefined ? d.creatorVersion <= version : true;
        if (d.createdByUserId === filter.createdByUserId && d.type === filter.type && d.status === filter.status
          && (!filter.campusId || d.campusId === filter.campusId) && eligible) {
          Object.assign(d,update.$set); d.editRevision = (d.editRevision ?? 0) + update.$inc.editRevision; modifiedCount++;
          if (partialFailure) { partialFailure=false; throw new Error('uncertain partial write'); }
        }
      }
      return { acknowledged, modifiedCount };
    } };
  });
  ({getActivities} = await import('../src/modules/activities/activities.service.js'));
  ({getActivityDetail:getDetail} = await import('../src/modules/activities/activities.detail.service.js'));
  ({updateAcademicProfile:updateProfile} = await import('../src/modules/users/users.service.js'));
  ({updateAccountState:updateState,getUserAccess:getAccess} = await import('../src/modules/users/access.service.js'));
  ({dispatchCreatorChanges:dispatch} = await import('../src/modules/activities/activities.lifecycle.worker.js'));
  ({activityIntegrity:integrity} = await import('../src/modules/activities/activities.integrity.js'));
  lifecycle = await import('../src/modules/activities/activities.lifecycle.repository.js');
  ({closePostgres} = await import('../src/database/supabase/postgres.js'));
});
beforeEach(async () => {
  documents=[]; mongoFailure=false; partialFailure=false; ackFailure=false; acknowledged=true;
  await db.exec('DELETE FROM campuslink_private.activity_creator_changes'); // Isolated PGlite fixture only.
});
after(async () => { globalThis.fetch=originalFetch; mock.restoreAll(); await closePostgres(); await db.close(); });

async function account(admin = false): Promise<VerifiedAuthConnection> {
  const id=randomUUID();
  await db.query('INSERT INTO auth.users VALUES ($1)',[id]);
  await db.query(`INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en,updated_at)
    VALUES ($1,$2,$3,'Creator',now(),$4)`,[id,institution,campus,initialVersion]);
  const auth: VerifiedAuthConnection = { userId:id,campusId:campus, roles:[],permissions:[], profile:{id,institucion_id:institution,
    campus_id:campus,nombre_completo:'Creator',verificado_en:now.toISOString(),estado_cuenta:'ACTIVA',deleted_at:null,foto_path:null} };
  if(admin){ await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) VALUES ($1,$2,$3)',[id,roles.ADMINISTRADOR,campus]);
    auth.roles=[{id:roles.ADMINISTRADOR,name:'ADMINISTRADOR',campusId:campus}]; }
  return auth;
}
async function change(creator: VerifiedAuthConnection, reason: string) {
  if(reason==='CAMPUS_CHANGED') return updateProfile(creator,{fullName:'Creator',campusId:otherCampus,careerIds:[],updatedAt:initialVersion});
  const admin=await account(true), detail=await getAccess(admin,campus,creator.userId);
  return updateState(admin,campus,creator.userId,{accountState:reason==='SUSPENDED'?'SUSPENDIDA':'DESACTIVADA',version:detail.version});
}
for (const reason of ['CAMPUS_CHANGED','SUSPENDED','DEACTIVATED']) {
  for(const type of ['COMMUNITY_ACTIVITY','OFFICIAL_EVENT']) {
    test(`${type}: creator ${reason} preserves history and follows confirmed lifecycle`,async () => {
      const creator=await account(), viewer=await account();
      const d=doc(creator.userId,type), hidden={...doc(creator.userId,type),visibility:'PRIVATE'}, cancelled={...doc(creator.userId,type),status:'CANCELLED'};
      documents=[d,hidden,cancelled];
      const participation={activityId:d._id,userId:creator.userId,campusId:campus,status:'JOINED',joinedAt:now};
      const savedParticipation=JSON.stringify(participation);
      assert.equal((await getActivities(viewer,{},dependencies())).length,1);
      await change(creator,reason);
      const events=await lifecycle.pendingCreatorChanges(); assert.equal(events.length,1); assert.equal(events[0].reason,reason);
      assert.equal(events[0].campus_id,campus); assert.equal(events[0].previous_version,initialVersion);
      assert.equal((await getActivities(viewer,{},dependencies())).length,type==='OFFICIAL_EVENT'?1:0);
      if(type==='OFFICIAL_EVENT') assert.equal((await getDetail(viewer,d._id.toHexString(),dependencies())).campusId,campus);
      else await assert.rejects(getDetail(viewer,d._id.toHexString(),dependencies()),{status:404});
      assert.deepEqual(await dispatch(),{processed:1,failed:0});
      assert.equal(d.status,type==='OFFICIAL_EVENT'?'ACTIVE':'CANCELLED');
      const snapshot=JSON.stringify(documents); await lifecycle.cancelCreatorCommunityActivities(events[0]);
      assert.equal(JSON.stringify(documents),snapshot); assert.equal(d.campusId,campus); assert.equal(d.createdByUserId,creator.userId);
      assert.equal(documents.length,3); assert.equal(JSON.stringify(participation),savedParticipation);
      assert.equal(cancelled.status,'CANCELLED'); assert.equal(hidden.visibility,'PRIVATE');
      if(reason!=='CAMPUS_CHANGED') await assert.rejects(integrity.withActor(creator,'general',async()=>true),{status:403});
      if(type==='OFFICIAL_EVENT' && reason!=='CAMPUS_CHANGED') {
        const {editActivity}=await import('../src/modules/activities/activities.edit.service.js');
        await assert.rejects(editActivity(creator,d._id.toHexString(),{title:'Edit',description:'Edit',startAt:d.startAt,endAt:d.endAt,
          location:d.location,expectedRevision:0,scope:'ONE'},dependencies()),{status:403});
      }
    });
  }
}

test('partial Mongo failure and SQL acknowledgement failure retain durable work; replay never increments twice',async()=>{
  const creator=await account(),viewer=await account(); documents=[doc(creator.userId),doc(creator.userId),doc(creator.userId,'OFFICIAL_EVENT')];
  await change(creator,'SUSPENDED'); partialFailure=true;
  assert.deepEqual(await dispatch(),{processed:0,failed:1}); assert.equal((await lifecycle.pendingCreatorChanges()).length,1);
  assert.deepEqual((await getActivities(viewer,{},dependencies())).map(d=>d.type),['OFFICIAL_EVENT']);
  ackFailure=true; assert.deepEqual(await dispatch(),{processed:0,failed:1});
  assert.deepEqual(documents.map(d=>d.editRevision ?? 0),[1,1,0]);
  ackFailure=false; assert.deepEqual(await dispatch(),{processed:1,failed:0});
  assert.deepEqual(documents.map(d=>d.editRevision ?? 0),[1,1,0]); assert.equal((await lifecycle.pendingCreatorChanges()).length,0);
});
test('profile transaction rollback creates neither a committed account change nor cancellation intent',async()=>{
  const creator=await account(); documents=[doc(creator.userId)];
  await assert.rejects((await import('../src/database/supabase/postgres.js')).withPostgresTransaction(async client=>{
    await client.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1",[creator.userId]);
    throw new Error('failure after change');
  }));
  assert.equal((await lifecycle.pendingCreatorChanges()).length,0); assert.equal(await integrity.isVisible(documents[0]),true);
});
test('move-away-and-back cannot resurrect old community occurrences; delayed replay protects new profile versions at microsecond precision',async()=>{
  const creator=await account(); documents=[doc(creator.userId)];
  await change(creator,'CAMPUS_CHANGED');
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[creator.userId,campus]);
  assert.equal(await integrity.isVisible(documents[0]),false);
  const events=await lifecycle.pendingCreatorChanges(); const old=events[0];
  const newVersion=await integrity.withActor(creator,'general',async(_,version)=>version);
  const newDoc={...doc(creator.userId),creatorVersion:newVersion};
  documents.push(newDoc);
  await dispatch(); assert.equal(newDoc.status,'ACTIVE'); assert.equal(documents[0].status,'CANCELLED');
  const precise={...doc(creator.userId),creatorVersion:old.previous_version.replace('123456','123457')};
  documents.push(precise); await lifecycle.cancelCreatorCommunityActivities(old); assert.equal(precise.status,'ACTIVE');
});
test('fresh role/permission checks deny revoked official permission, inactive actor, foreign campus and ownership override',async()=>{
  const creator=await account(); creator.roles=[{id:roles.USUARIO_AUTORIZADO,name:'USUARIO_AUTORIZADO',campusId:campus}];
  creator.permissions=[{id:permissionId,name:'PUBLICAR_EVENTO',campusId:campus}];
  await db.query('INSERT INTO usuario_rol(perfil_usuario_id,rol_id,campus_id) VALUES ($1,$2,$3)',[creator.userId,roles.USUARIO_AUTORIZADO,campus]);
  await assert.rejects(integrity.withActor(creator,'officialActivities',async()=>true),{status:403});
  await db.query('INSERT INTO usuario_permiso(perfil_usuario_id,permiso_id,campus_id) VALUES ($1,$2,$3)',[creator.userId,permissionId,campus]);
  assert.equal(await integrity.withActor(creator,'officialActivities',async (_,version)=>version),initialVersion);
  const {previewActivityEdit}=await import('../src/modules/activities/activities.edit.service.js');
  const official=doc(creator.userId,'OFFICIAL_EVENT');
  const input={title:'Edit',description:'Edit',location:official.location,startAt:official.startAt,endAt:official.endAt,scope:'ONE' as const,expectedRevision:0};
  await db.query('UPDATE usuario_permiso SET revocado_en=now() WHERE perfil_usuario_id=$1',[creator.userId]);
  await assert.rejects(integrity.withActor(creator,'general',current=>previewActivityEdit(current,official._id.toHexString(),input,
    {...dependencies(),findEditable:async()=>official})),{status:403});
  await assert.rejects(previewActivityEdit(await account(true),official._id.toHexString(),input,{...dependencies(),findEditable:async()=>official}),{status:403});
  await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[creator.userId,otherCampus]);
  await assert.rejects(integrity.withActor(creator,'general',async()=>true),{status:403});
});
test('queue migration is repeatable and clients cannot query or execute private lifecycle infrastructure',async()=>{
  const creator=await account(); await change(creator,'DEACTIVATED');
  const before=await lifecycle.pendingCreatorChanges(); await db.exec(await migration()); assert.deepEqual(await lifecycle.pendingCreatorChanges(),before);
  for(const role of ['anon','authenticated']){
    await db.exec('SET ROLE '+role);
    await assert.rejects(db.query('SELECT * FROM campuslink_private.activity_creator_changes'),/permission denied/);
    await assert.rejects(db.query('SELECT campuslink_private.enqueue_activity_creator_change()'),/permission denied/);
    await db.exec('RESET ROLE');
  }
});
test('PostgreSQL failure stops processing before Mongo; unconfirmed Mongo writes cannot acknowledge',async()=>{
  const creator=await account(); documents=[doc(creator.userId)]; await change(creator,'SUSPENDED');
  let calls=0;
  await assert.rejects(dispatch({pending:async()=>{throw new Error('SQL down');},cancel:async()=>{calls++;},acknowledge:async()=>{calls++;}}));
  assert.equal(calls,0); mongoFailure=true; assert.deepEqual(await dispatch(),{processed:0,failed:1});
  assert.equal((await lifecycle.pendingCreatorChanges()).length,1); assert.equal(documents[0].status,'ACTIVE');
  mongoFailure=false; acknowledged=false; assert.deepEqual(await dispatch(),{processed:0,failed:1});
  assert.equal((await lifecycle.pendingCreatorChanges()).length,1);
  acknowledged=true; assert.deepEqual(await dispatch(),{processed:1,failed:0});
});
test('repeating the confirmed account state keeps one durable event and one administrative audit',async()=>{
  const creator=await account(),admin=await account(true);
  const before=await getAccess(admin,campus,creator.userId);
  const after=await updateState(admin,campus,creator.userId,{accountState:'SUSPENDIDA',version:before.version});
  await updateState(admin,campus,creator.userId,{accountState:'SUSPENDIDA',version:after.version});
  assert.equal((await lifecycle.pendingCreatorChanges()).length,1);
  assert.equal((await db.query('SELECT 1 FROM auditoria WHERE entidad_id=$1',[creator.userId])).rows.length,1);
});
test('legacy community records with skewed timestamps cancel without losing history or reappearing after a campus return',async()=>{
  const creator=await account(); const legacy=doc(creator.userId); delete legacy.creatorVersion;
  legacy.createdAt=new Date('2099-01-01T00:00:00Z'); documents=[legacy];
  await change(creator,'CAMPUS_CHANGED'); await db.query('UPDATE perfil_usuario SET campus_id=$2 WHERE id=$1',[creator.userId,campus]);
  assert.equal(await integrity.isVisible(legacy),false);
  await dispatch(); assert.equal(legacy.status,'CANCELLED'); assert.equal(legacy.createdAt.toISOString(),'2099-01-01T00:00:00.000Z');
});
