import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';

const db = new PGlite();
const campus = randomUUID(), sibling = randomUUID(), foreign = randomUUID(), institution = randomUUID();
const owner = randomUUID(), requester = randomUUID(), other = randomUUID(), outsider = randomUUID(), inactive = randomUUID();
const transaction = <T>(run: (client: PoolClient) => Promise<T>) => db.transaction(client => run(client as unknown as PoolClient));
let events: typeof import('../src/modules/marketplace/marketplace.notifications.js');
let inbox: typeof import('../src/modules/users/repositories/notifications.repository.js');
before(async () => {
  Object.assign(process.env, { NODE_ENV:'test', MONGODB_URI:'mongodb://localhost:27017',
    SUPABASE_URL:'https://resource-test.invalid', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test', SUPABASE_SECRET_KEY:'test' });
  await db.exec(`CREATE TABLE campus(id uuid PRIMARY KEY,institucion_id uuid);
    CREATE TABLE perfil_usuario(id uuid PRIMARY KEY,campus_id uuid,institucion_id uuid,estado_cuenta text,deleted_at timestamptz);
    CREATE TABLE publicacion_recurso(id uuid PRIMARY KEY,campus_id uuid,propietario_id uuid,tipo_recurso text,titulo text,updated_at timestamptz DEFAULT now());
    CREATE TABLE solicitud_recurso(id uuid PRIMARY KEY,publicacion_id uuid,solicitante_id uuid,solicitada_en timestamptz DEFAULT now());
    CREATE TABLE transaccion_recurso(id uuid PRIMARY KEY,publicacion_id uuid,solicitud_id uuid,propietario_id uuid,receptor_id uuid);
    CREATE TABLE notificacion(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),destinatario_id uuid,publicacion_id uuid,transaccion_id uuid,actividad_id text,
      tipo_notificacion text,titulo text,mensaje text,created_at timestamptz DEFAULT now(),leida_en timestamptz,deleted_at timestamptz,campus_id uuid,actividad_evento_clave text);
    CREATE UNIQUE INDEX event_key ON notificacion(destinatario_id,actividad_evento_clave) WHERE actividad_evento_clave IS NOT NULL;`);
  await db.query('INSERT INTO campus VALUES($1,$4),($2,$4),($3,$3)', [campus,sibling,foreign,institution]);
  for (const [id,site,state] of [[owner,campus,'ACTIVA'],[requester,campus,'ACTIVA'],[other,sibling,'ACTIVA'],[outsider,foreign,'ACTIVA'],[inactive,campus,'SUSPENDIDA']]) {
    await db.query('INSERT INTO perfil_usuario VALUES($1,$2,$3,$4,null)',[id,site,site===foreign?foreign:institution,state]);
  }
  events = await import('../src/modules/marketplace/marketplace.notifications.js');
  inbox = await import('../src/modules/users/repositories/notifications.repository.js');
});
after(async () => { await db.close(); });
async function resource(type='FISICO', users=[requester]) {
  const id = randomUUID(), requests = [];
  await db.query("INSERT INTO publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo) VALUES($1,$2,$3,$4,'Recurso')",[id,campus,owner,type]);
  for (const user of users) {
    const requestId=randomUUID(); requests.push(requestId);
    await db.query('INSERT INTO solicitud_recurso(id,publicacion_id,solicitante_id) VALUES($1,$2,$3)',[requestId,id,user]);
  }
  return {id,requests};
}
test('new request belongs only to the owner, keeps its request target and never resurrects after deletion/replay',async()=>{
  const r=await resource();
  await transaction(client=>events.notifyResourceRequest(client,r.id,r.requests[0]));
  await transaction(client=>events.notifyResourceRequest(client,r.id,r.requests[0]));
  const notices=await transaction(client=>inbox.listOwnNotifications(client,owner,campus));
  const notice=notices.items.find(item=>'publicationId' in item&&item.publicationId===r.id)!;
  assert.equal(notice.type,'RESOURCE_REQUEST_RECEIVED');assert.ok('requestId' in notice);assert.equal(notice.requestId,r.requests[0]);
  assert.equal((await transaction(client=>inbox.listOwnNotifications(client,requester,campus))).items.some(item=>item.id===notice.id),false);
  assert.equal(await transaction(client=>inbox.updateOwnNotification(client,outsider,foreign,notice.id,false)),false);
  const total=await transaction(client=>inbox.countOwnUnreadNotifications(client,owner,campus));
  await transaction(client=>inbox.updateOwnNotification(client,owner,campus,notice.id,false));
  assert.equal(await transaction(client=>inbox.countOwnUnreadNotifications(client,owner,campus)),total-1);
  await transaction(client=>inbox.updateOwnNotification(client,owner,campus,notice.id,true));
  await transaction(client=>events.notifyResourceRequest(client,r.id,r.requests[0]));
  assert.equal((await db.query('SELECT id FROM notificacion WHERE publicacion_id=$1',[r.id])).rows.length,1);
  assert.equal((await transaction(client=>inbox.listOwnNotifications(client,owner,campus))).items.some(item=>item.id===notice.id),false);
});
test('resource revisions notify distinct prior requesters, exclude inactive/foreign/physical other-campus users and preserve versions',async()=>{
  const r=await resource('FISICO',[requester,requester,other,outsider,inactive]);
  await transaction(client=>events.notifyResourceUpdated(client,r.id));
  await transaction(client=>events.notifyResourceUpdated(client,r.id));
  let rows=(await db.query('SELECT destinatario_id FROM notificacion WHERE publicacion_id=$1',[r.id])).rows;
  assert.deepEqual(rows.map(row=>row.destinatario_id),[requester]);
  await db.query("UPDATE publicacion_recurso SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[r.id]);
  await transaction(client=>events.notifyResourceUpdated(client,r.id));
  rows=(await db.query('SELECT destinatario_id FROM notificacion WHERE publicacion_id=$1',[r.id])).rows;assert.equal(rows.length,2);
  const page=await transaction(client=>inbox.listOwnNotifications(client,requester,campus));
  assert.equal(page.items.filter(item=>'publicationId' in item&&item.publicationId===r.id).length,2);
});
test('digital notifications use the existing institutional scope and do not cross institutions',async()=>{
  const r=await resource('DIGITAL',[other,outsider,inactive]);
  await transaction(client=>events.notifyResourceUpdated(client,r.id));
  assert.deepEqual((await db.query('SELECT destinatario_id FROM notificacion WHERE publicacion_id=$1',[r.id])).rows.map(row=>row.destinatario_id),[other]);
  const page=await transaction(client=>inbox.listOwnNotifications(client,other,sibling));
  const notice=page.items.find(item=>'publicationId' in item&&item.publicationId===r.id)!;assert.ok('resourceType' in notice);assert.equal(notice.resourceType,'DIGITAL');
  assert.equal(await transaction(client=>inbox.updateOwnNotification(client,other,foreign,notice.id,false)),false);
});
test('acceptance notifies only the selected receiver and carries the real transaction, with idempotent delivery',async()=>{
  const r=await resource('FISICO',[requester,other]),id=randomUUID();
  await db.query('INSERT INTO transaccion_recurso VALUES($1,$2,$3,$4,$5)',[id,r.id,r.requests[0],owner,requester]);
  for(let i=0;i<2;i++)await transaction(client=>events.notifyResourceRequest(client,r.id,r.requests[0],id));
  const rows=(await db.query('SELECT * FROM notificacion WHERE publicacion_id=$1',[r.id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].destinatario_id,requester);
  const notice=(await transaction(client=>inbox.listOwnNotifications(client,requester,campus))).items.find(row=>row.id===rows[0].id)!;
  assert.equal(notice.type,'RESOURCE_REQUEST_ACCEPTED');assert.ok('transactionId' in notice);assert.equal(notice.transactionId,id);
  assert.equal((await transaction(client=>inbox.listOwnNotifications(client,other,sibling))).items.some(row=>row.id===notice.id),false);
});
test('coordination uses the existing row without an activity key and inbox deletion preserves conversation history',async()=>{
  const r=await resource(),trade=randomUUID(),notice=randomUUID();
  await db.query('INSERT INTO transaccion_recurso VALUES($1,$2,$3,$4,$5)',[trade,r.id,r.requests[0],owner,requester]);
  await db.query("INSERT INTO notificacion(id,destinatario_id,publicacion_id,transaccion_id,tipo_notificacion,titulo,mensaje) VALUES($1,$2,$3,$4,'COORDINACION_RECURSO','Coordinación','Estoy en Edificio E.')",[notice,requester,r.id,trade]);
  const page=await transaction(client=>inbox.listOwnNotifications(client,requester,campus));assert.ok(page.items.some(row=>row.id===notice&&row.type==='COORDINACION_RECURSO'));
  assert.equal(await transaction(client=>inbox.updateOwnNotification(client,owner,campus,notice,true)),false);
  await transaction(client=>inbox.updateOwnNotification(client,requester,campus,notice,true));
  const {physicalgoodsCoordinationMessages}=await import('../src/modules/marketplace/physicalgoods/physicalgoods.transactions.repository.js');
  const messages=await transaction(client=>physicalgoodsCoordinationMessages(client,r.id,trade,[owner,requester],{page:1,limit:10,offset:0}));
  assert.equal(messages.length,1);assert.equal(messages[0].id,notice);
});
test('notification writes roll back with their business operation',async()=>{
  const r=await resource();
  await assert.rejects(transaction(async client=>{await events.notifyResourceRequest(client,r.id,r.requests[0]);throw new Error('rollback');}));
  assert.equal((await db.query('SELECT id FROM notificacion WHERE publicacion_id=$1',[r.id])).rows.length,0);
});

test('digital chat notifications reach only their recipient across institutional campuses and retain their transaction target',async()=>{
  const r=await resource('DIGITAL',[other]),trade=randomUUID(),notice=randomUUID();
  await db.query('INSERT INTO transaccion_recurso VALUES($1,$2,$3,$4,$5)',[trade,r.id,r.requests[0],owner,other]);
  await db.query("INSERT INTO notificacion(id,destinatario_id,publicacion_id,transaccion_id,tipo_notificacion,titulo,mensaje) VALUES($1,$2,$3,$4,'COORDINACION_RECURSO','Chat','Hola desde otra sede')",[notice,other,r.id,trade]);
  const page=await transaction(client=>inbox.listOwnNotifications(client,other,sibling));
  const message=page.items.find(row=>row.id===notice)!;assert.equal(message.type,'COORDINACION_RECURSO');
  assert.ok('resourceType' in message);assert.equal(message.resourceType,'DIGITAL');assert.equal(message.transactionId,trade);
  assert.equal((await transaction(client=>inbox.listOwnNotifications(client,owner,campus))).items.some(row=>row.id===notice),false);
  assert.equal(await transaction(client=>inbox.updateOwnNotification(client,other,foreign,notice,false)),false);
  assert.equal(await transaction(client=>inbox.updateOwnNotification(client,outsider,foreign,notice,false)),false);
  assert.equal(await transaction(client=>inbox.updateOwnNotification(client,other,sibling,notice,false)),true);
});
