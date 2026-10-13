import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import type { PoolClient } from 'pg';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { NewContentReport, ReportContentInput } from '../src/modules/reports/reports.types.js';

const db = new PGlite();
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID();
const user = randomUUID(), owner = randomUUID(), outsider = randomUUID(), category = randomUUID(), roleId = randomUUID();
const physical = randomUUID(), digital = randomUUID(), otherPublication = randomUUID(), incompletePublication = randomUUID();
const physicalTransaction = randomUUID(), digitalTransaction = randomUUID();
const transaction = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> =>
  db.transaction(client => operation(client as unknown as PoolClient));
const auth = (userId = user, campusId = campus): VerifiedAuthConnection => ({ userId, campusId, roles: [], permissions: [], profile: {
  id: userId, campus_id: campusId, institucion_id: institution, nombre_completo: 'Usuario', foto_path: null,
  verificado_en: '2026-10-13T12:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null,
} });
let reportContent: typeof import('../src/modules/reports/reports.service.js').reportContent;
let saveContentReport: typeof import('../src/modules/reports/reports.repository.js').saveContentReport;
const submit = (input: ReportContentInput, account = auth()) => reportContent(account, input, {
  saveContentReport: report => saveContentReport(report, transaction),
});
const count = async () => (await db.query<{ count: number }>('select count(*)::int as count from reporte_contenido')).rows[0].count;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://resource-reports-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  await db.exec('create schema auth; create table auth.users(id uuid primary key);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'perfil_usuario', 'rol', 'usuario_rol', 'publicacion_recurso',
    'categoria_recurso_fisico', 'recurso_fisico', 'recurso_digital', 'mensaje_solicitud', 'solicitud_recurso',
    'transaccion_recurso', 'reporte_contenido']) {
    const definition = schema.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(definition, name); await db.exec(definition);
  }
  await db.query('insert into auth.users values ($1),($2),($3)', [user, owner, outsider]);
  await db.query("insert into institucion(id,nombre) values ($1,'Institución')", [institution]);
  await db.query("insert into campus(id,institucion_id,nombre) values ($1,$3,'Sede'),($2,$3,'Otra sede')", [campus, otherCampus, institution]);
  for (const id of [user, owner, outsider]) await db.query(`insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en)
    values ($1,$2,$3,'Usuario',now())`, [id, institution, campus]);
  await db.query("insert into categoria_recurso_fisico(id,nombre) values ($1,'Libros')", [category]);
  await db.query("insert into rol(id,nombre) values ($1,'USUARIO_AUTORIZADO')", [roleId]);
  for (const [id, at, type] of [[physical, campus, 'FISICO'], [digital, campus, 'DIGITAL'],
    [otherPublication, otherCampus, 'FISICO'], [incompletePublication, campus, 'FISICO']]) {
    await db.query(`insert into publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo,descripcion,modalidad,precio)
      values ($1,$2,$3,$4,'Título original','Descripción original','VENTA',1500)`, [id, at, owner, type]);
  }
  await db.query("insert into recurso_fisico(publicacion_id,categoria_id,estado_uso) values ($1,$3,'BUEN_ESTADO'),($2,$3,'BUEN_ESTADO')", [physical, otherPublication, category]);
  await db.query('insert into recurso_digital(publicacion_id) values ($1)', [digital]);
  await db.exec("insert into mensaje_solicitud(codigo,descripcion) values ('QUIERO','Interés')");
  for (const [id, publication] of [[physicalTransaction, physical], [digitalTransaction, digital]]) {
    const request = randomUUID();
    await db.query("insert into solicitud_recurso(id,publicacion_id,solicitante_id,codigo_mensaje) values ($1,$2,$3,'QUIERO')", [request, publication, user]);
    await db.query(`insert into transaccion_recurso(id,solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada,monto_acordado)
      values ($1,$2,$3,$4,$5,'VENTA',1500)`, [id, request, publication, owner, user]);
  }
  ({ reportContent } = await import('../src/modules/reports/reports.service.js'));
  ({ saveContentReport } = await import('../src/modules/reports/reports.repository.js'));
});
beforeEach(async () => {
  await db.exec(`delete from reporte_contenido; delete from usuario_rol;
    update campus set activo=true;
    update perfil_usuario set estado_cuenta='ACTIVA',deleted_at=null,verificado_en=now();
    update publicacion_recurso set estado_publicacion='DISPONIBLE',deleted_at=null,titulo='Título original',descripcion='Descripción original';
    update transaccion_recurso set estado_transaccion='RESERVADA',monto_acordado=1500;`);
  await db.query('update perfil_usuario set campus_id=$1', [campus]);
});
after(async () => { await db.close(); await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('physical/digital publications in all approved states use one pending record with server identity, evidence and database date', async () => {
  for (const [type, id] of [['PUBLICACION_FISICA', physical], ['PUBLICACION_DIGITAL', digital]] as const) {
    for (const state of ['DISPONIBLE', 'RESERVADO', 'FINALIZADO']) {
      await db.query('update publicacion_recurso set estado_publicacion=$2 where id=$1', [id, state]);
      const receipt = await submit({ targetType: type, targetId: id.toUpperCase(), reason: '  Mal uso  ', description: '  Detalle  ' });
      const row = (await db.query<Record<string, any>>('select * from reporte_contenido where id=$1', [receipt.id])).rows[0];
      assert.equal(row.reportante_id, user); assert.equal(row.entidad_tipo, type); assert.equal(row.entidad_id, id);
      assert.equal(row.campus_id, campus); assert.equal(row.motivo, 'Mal uso'); assert.equal(row.descripcion, 'Detalle');
      assert.equal(row.estado_reporte, 'PENDIENTE'); assert.equal(row.resuelto_por_id, null); assert.equal(row.resuelto_en, null);
      assert.equal(receipt.reportedAt, new Date(row.reportado_en).toISOString());
      assert.equal(row.contenido_reportado_json.title, 'Título original'); assert.equal(row.contenido_reportado_json.status, state);
      assert.deepEqual(Object.keys(receipt).sort(), ['campusId','id','reportedAt','status','targetId','targetType']);
      if (type === 'PUBLICACION_FISICA') assert.equal(row.contenido_reportado_json.condition, 'BUEN_ESTADO');
    }
  }
});

test('wrong campus/type, nonexistent publications and missing subtype cannot create a report, including administrator guesses', async () => {
  const admin = auth(); admin.roles = [{ id: randomUUID(), name: 'ADMINISTRADOR', campusId: otherCampus }];
  for (const [type, id] of [['PUBLICACION_FISICA', otherPublication], ['PUBLICACION_FISICA', digital],
    ['PUBLICACION_DIGITAL', physical], ['PUBLICACION_FISICA', incompletePublication], ['PUBLICACION_DIGITAL', randomUUID()]] as const) {
    await assert.rejects(submit({ targetType: type, targetId: id, reason: 'Motivo' }, admin), { status: 404 });
  }
  assert.equal(await count(), 0);
});

test('hidden/cancelled/deleted publications cannot be reported as public content even by their owner', async () => {
  for (const [type, id] of [['PUBLICACION_FISICA', physical], ['PUBLICACION_DIGITAL', digital]] as const) {
    for (const state of ['OCULTO', 'CANCELADO']) {
      await db.query('update publicacion_recurso set estado_publicacion=$2 where id=$1', [id, state]);
      await assert.rejects(submit({ targetType: type, targetId: id, reason: 'Motivo' }, auth(owner)), { status: 404 });
    }
    await db.query("update publicacion_recurso set estado_publicacion='DISPONIBLE',deleted_at=now() where id=$1", [id]);
    await assert.rejects(submit({ targetType: type, targetId: id, reason: 'Motivo' }), { status: 404 });
  }
  assert.equal(await count(), 0);
});

test('each participant may report physical/digital transactions in every state without changing that state or requests', async () => {
  for (const id of [physicalTransaction, digitalTransaction]) {
    for (const state of ['RESERVADA', 'PENDIENTE_CONFIRMACION', 'COMPLETADA', 'CANCELADA']) {
      await db.query('update transaccion_recurso set estado_transaccion=$2 where id=$1', [id, state]);
      const original = (await db.query('select * from transaccion_recurso where id=$1', [id])).rows[0];
      const requests = (await db.query('select * from solicitud_recurso order by id')).rows;
      for (const participant of [user, owner]) {
        const receipt = await submit({ targetType: 'TRANSACCION', targetId: id, reason: 'Comportamiento indebido' }, auth(participant));
        const snapshot = (await db.query<{ contenido_reportado_json: Record<string, any> }>(
          'select contenido_reportado_json from reporte_contenido where id=$1', [receipt.id])).rows[0].contenido_reportado_json;
        assert.equal(snapshot.id, id); assert.equal(snapshot.status, state); assert.equal(snapshot.ownerId, owner);
        assert.equal(snapshot.recipientId, user); assert.equal(snapshot.publicationId, original.publicacion_id);
        assert.equal(snapshot.publication.resourceType, id === physicalTransaction ? 'FISICO' : 'DIGITAL');
      }
      assert.deepEqual((await db.query('select * from transaccion_recurso where id=$1', [id])).rows[0], original);
      assert.deepEqual((await db.query('select * from solicitud_recurso order by id')).rows, requests);
    }
  }
});

test('nonparticipants and nonexistent transaction IDs return indistinguishable not-found errors, including administrators', async () => {
  const admin = auth(outsider); admin.roles = [{ id: randomUUID(), name: 'ADMINISTRADOR', campusId: campus }];
  for (const id of [physicalTransaction, digitalTransaction, randomUUID()]) {
    await assert.rejects(submit({ targetType: 'TRANSACCION', targetId: id, reason: 'Motivo' }, admin), {
      status: 404, message: 'Esta transacción no está disponible para denunciar.',
    });
  }
  assert.equal(await count(), 0);
});

test('a participant who moves campus reports their historical transaction in its original campus but cannot browse that campus publications', async () => {
  await db.query('update perfil_usuario set campus_id=$2 where id=$1', [user, otherCampus]);
  const moved = auth(user, otherCampus);
  const receipt = await submit({ targetType: 'TRANSACCION', targetId: physicalTransaction, reason: 'Incidente anterior' }, moved);
  assert.equal(receipt.campusId, campus);
  await assert.rejects(submit({ targetType: 'PUBLICACION_FISICA', targetId: physical, reason: 'Motivo' }, moved), { status: 404 });
  await assert.rejects(submit({ targetType: 'TRANSACCION', targetId: physicalTransaction, reason: 'Motivo' }, auth()), { status: 403 });
  assert.equal(await count(), 1);
});

test('own transaction remains reportable after publication hiding/deletion and preserves evidence after later edits', async () => {
  await db.query("update publicacion_recurso set estado_publicacion='OCULTO',deleted_at=now() where id=$1", [digital]);
  const receipt = await submit({ targetType: 'TRANSACCION', targetId: digitalTransaction, reason: 'Mal uso' });
  const beforeRow = (await db.query('select * from publicacion_recurso where id=$1', [digital])).rows[0];
  await db.query("update publicacion_recurso set titulo='Editado',descripcion='Nueva descripción' where id=$1", [digital]);
  await db.query("update transaccion_recurso set estado_transaccion='CANCELADA',monto_acordado=5000 where id=$1", [digitalTransaction]);
  const snapshot = (await db.query<{ contenido_reportado_json: Record<string, any> }>(
    'select contenido_reportado_json from reporte_contenido where id=$1', [receipt.id])).rows[0].contenido_reportado_json;
  assert.equal(snapshot.publication.title, 'Título original'); assert.equal(snapshot.publication.status, 'OCULTO');
  assert.equal(snapshot.publication.deletedAt, new Date(beforeRow.deleted_at as string).toISOString());
  assert.equal(snapshot.status, 'RESERVADA'); assert.equal(Number(snapshot.amount), 1500);
  const evidenceText = JSON.stringify(snapshot);
  for (const field of ['storage_path', 'bucket_id', 'downloadUrl', 'access_token', 'reportante_id']) assert.ok(!evidenceText.includes(field));
});

test('publication evidence is immutable and SQL-like reasons remain plain data without modifying the publication', async () => {
  const publicationBefore = (await db.query('select * from publicacion_recurso where id=$1', [physical])).rows[0];
  const reason = "Mal uso '; DELETE FROM publicacion_recurso; --";
  const receipt = await submit({ targetType: 'PUBLICACION_FISICA', targetId: physical, reason });
  assert.deepEqual((await db.query('select * from publicacion_recurso where id=$1', [physical])).rows[0], publicationBefore);
  await db.query("update publicacion_recurso set titulo='Nuevo título',estado_publicacion='OCULTO' where id=$1", [physical]);
  const row = (await db.query<{ motivo: string; contenido_reportado_json: Record<string, any> }>(
    'select motivo,contenido_reportado_json from reporte_contenido where id=$1', [receipt.id])).rows[0];
  assert.equal(row.motivo, reason); assert.equal(row.contenido_reportado_json.title, 'Título original');
  assert.equal(row.contenido_reportado_json.status, 'DISPONIBLE');
});

test('SQL revalidates active account, current campus, verification and authorized role before saving', async () => {
  const input = { targetType: 'PUBLICACION_DIGITAL', targetId: digital, reason: 'Motivo' } as const;
  for (const state of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('update perfil_usuario set estado_cuenta=$2 where id=$1', [user, state]);
    await assert.rejects(submit(input), { status: 403 });
  }
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',deleted_at=now() where id=$1", [user]);
  await assert.rejects(submit(input), { status: 403 });
  await db.query('update perfil_usuario set deleted_at=null,verificado_en=null where id=$1', [user]);
  await assert.rejects(submit(input), { status: 403 });
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)', [user, roleId, otherCampus]);
  await assert.rejects(submit(input), { status: 403 });
  await db.query('update usuario_rol set campus_id=$1', [campus]);
  const authorized = auth(); authorized.profile.verificado_en = null;
  authorized.roles = [{ id: roleId, name: 'USUARIO_AUTORIZADO', campusId: campus }];
  assert.equal((await submit(input, authorized)).status, 'PENDIENTE');
  await db.exec('update usuario_rol set revocado_en=now()');
  await assert.rejects(submit(input, authorized), { status: 403 });
  await db.query('update perfil_usuario set verificado_en=now() where id=$1', [user]);
  await db.query('update campus set activo=false where id=$1', [campus]);
  await assert.rejects(submit(input), { status: 403 });
  assert.equal(await count(), 1);
});

test('service rejects inactive/unverified callers before resource reads; database failure rolls back and returns a sanitized 503', async () => {
  const input = { targetType: 'PUBLICACION_DIGITAL', targetId: digital, reason: 'Motivo' } as const;
  let calls = 0;
  for (const patch of [{ estado_cuenta: 'SUSPENDIDA' }, { verificado_en: null }, { deleted_at: '2026-10-13T12:00:00Z' }]) {
    const account = auth(); Object.assign(account.profile, patch);
    await assert.rejects(reportContent(account, input, { saveContentReport: async () => { calls++; throw new Error('must not read'); } }), { status: 403 });
  }
  assert.equal(calls, 0);
  const failAfterInsert = async <T>(operation: (client: PoolClient) => Promise<T>) => transaction(async client => {
    await operation(client); throw new Error('private database credentials');
  });
  await assert.rejects(reportContent(auth(), input, { saveContentReport: report => saveContentReport(report, failAfterInsert) }), {
    status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'No se pudo confirmar el envío de la denuncia.',
  });
  assert.equal(await count(), 0);
});

test('common HTTP endpoint validates identity/locators/overrides, reports SQL resources privately and exposes no listing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://resource-reports-test.invalid');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user, email: 'test@duocuc.cl', email_confirmed_at: '2026-10-13T12:00:00Z' });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth().profile]);
    return Response.json([]);
  };
  const { createReportsRouter } = await import('../src/modules/reports/reports.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json()); app.use('/api/v1/reports', createReportsRouter(false, {
    saveContentReport: (report: NewContentReport) => saveContentReport(report, transaction),
  })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/reports`;
  const headers = { Authorization: 'Bearer reports.resource.test', 'Content-Type': 'application/json' };
  const body = { targetType: 'PUBLICACION_FISICA', targetId: physical, reason: 'Motivo' };
  try {
    assert.equal((await originalFetch(url, { method: 'POST' })).status, 401);
    assert.equal((await originalFetch(url, { headers })).status, 404);
    for (const patch of [{ targetType: 'VALORACION' }, { targetType: 'COMPORTAMIENTO' }, { targetId: 'invalid' },
      { campusId: otherCampus }, { userId: owner }, { status: 'RESUELTO' }, { snapshot: {} }, { reportedAt: '2020-01-01' }, { reason: '' }]) {
      assert.equal((await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, ...patch }) })).status, 400);
    }
    assert.equal((await originalFetch(url + '?campusId=' + otherCampus, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
    assert.equal(await count(), 0);
    for (const [targetType, targetId] of [['PUBLICACION_FISICA', physical], ['PUBLICACION_DIGITAL', digital], ['TRANSACCION', physicalTransaction]]) {
      const response = await originalFetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, targetType, targetId }) });
      assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
      const receipt = (await response.json()).data;
      assert.equal(receipt.targetType, targetType); assert.equal(receipt.targetId, targetId); assert.equal(receipt.status, 'PENDIENTE');
      assert.equal('snapshot' in receipt, false); assert.equal('userId' in receipt, false);
    }
    assert.equal((await originalFetch(url, { method: 'POST', headers,
      body: JSON.stringify({ ...body, targetId: otherPublication }) })).status, 404);
    assert.equal(await count(), 3);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
