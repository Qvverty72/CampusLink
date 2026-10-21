import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';

test('analytics migration preserves legacy facts and captures atomic, deduplicated future events', async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://analytics-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' });
  const { recordResourceView } = await import('../src/modules/analytics/analytics.repository.js');
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
    for (const name of ['institucion', 'campus', 'asignatura', 'perfil_usuario', 'publicacion_recurso',
      'publicacion_asignatura', 'interaccion_recurso', 'mensaje_solicitud', 'solicitud_recurso',
      'transaccion_recurso', 'confirmacion_transaccion', 'reporte_contenido', 'auditoria']) {
      const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
      assert.ok(sql, name); await db.exec(sql);
    }
    const institution = randomUUID(), campus = randomUUID(), owner = randomUUID(), viewer = randomUUID();
    const publication = randomUUID(), subject = randomUUID();
    await db.query('insert into institucion(id,nombre) values($1,$2)', [institution, 'Institución']);
    await db.query('insert into campus(id,institucion_id,nombre) values($1,$2,$3)', [campus, institution, 'Campus']);
    await db.query('insert into auth.users(id) values($1),($2)', [owner, viewer]);
    await db.query(`insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo)
      values($1,$3,$4,'Propietario'),($2,$3,$4,'Visitante')`, [owner, viewer, institution, campus]);
    await db.query('insert into asignatura(id,nombre,codigo) values($1,$2,$3)', [subject, 'Matemática', 'MAT']);
    await db.query(`insert into publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo,modalidad)
      values($1,$2,$3,'FISICO','Libro','DONACION')`, [publication, campus, owner]);
    await db.query('insert into publicacion_asignatura(publicacion_id,asignatura_id) values($1,$2)', [publication, subject]);
    await db.query("insert into mensaje_solicitud(codigo,descripcion) values('INTERES','Me interesa')");
    const legacy = await db.query<{id:string}>(`insert into solicitud_recurso(publicacion_id,solicitante_id,codigo_mensaje)
      values($1,$2,'INTERES') returning id`, [publication, viewer]);
    await db.query(`insert into auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion)
      values($1,$2,$3,'perfil_usuario',$4,'SUSPENDER_CUENTA'),
        ($1,$2,$3,'perfil_usuario',$4,'REACTIVAR_CUENTA')`, [owner, institution, campus, viewer]);
    const migration = await readFile('src/database/supabase/migrations/f2_7_01_eventos_analitica.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const backfill = await db.query<{event_type:string;subject_ids:string[]}>(`select event_type,subject_ids
      from evento_analitica where resource_id=$1 order by event_type`, [publication]);
    assert.deepEqual(backfill.rows.map(row => row.event_type), ['RESOURCE_REQUESTED']);
    assert.deepEqual(backfill.rows[0].subject_ids, [subject]);
    assert.equal((await db.query("select * from evento_analitica where event_type='ACCOUNT_ACTIVA'")).rows.length, 3);
    assert.equal((await db.query("select * from evento_analitica where event_key like 'account-audit:%' and event_type='ACCOUNT_SUSPENDIDA'")).rows.length, 1);

    // Repeated detail reads are one view; a failed write rolls back its analytics event.
    const client = { query: (sql: string, values?: unknown[]) => db.query(sql, values) } as unknown as PoolClient;
    await db.exec('begin');
    await recordResourceView(client, institution, campus, viewer, publication, 'FISICO');
    await recordResourceView(client, institution, campus, viewer, publication, 'FISICO');
    await db.exec('commit');
    assert.equal((await db.query("select * from evento_analitica where resource_id=$1 and event_type='RESOURCE_VIEWED'", [publication])).rows.length, 1);
    await db.exec('begin');
    const rolledBack = await db.query<{id:string}>(`insert into solicitud_recurso(publicacion_id,solicitante_id,codigo_mensaje)
      values($1,$2,'INTERES') returning id`, [publication, owner]);
    await db.exec('rollback');
    assert.equal((await db.query('select * from evento_analitica where source_id=$1', [rolledBack.rows[0].id])).rows.length, 0);

    const trade = await db.query<{id:string}>(`insert into transaccion_recurso
      (solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada)
      values($1,$2,$3,$4,'DONACION') returning id`, [legacy.rows[0].id, publication, owner, viewer]);
    await db.query(`insert into confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante)
      values($1,$2,'PROPIETARIO')`, [trade.rows[0].id, owner]);
    await db.query("update transaccion_recurso set estado_transaccion='PENDIENTE_CONFIRMACION' where id=$1", [trade.rows[0].id]);
    await db.query(`insert into confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante)
      values($1,$2,'RECEPTOR')`, [trade.rows[0].id, viewer]);
    await db.query("update transaccion_recurso set estado_transaccion='COMPLETADA',completada_en=clock_timestamp() where id=$1", [trade.rows[0].id]);
    await db.query("update transaccion_recurso set estado_transaccion='COMPLETADA' where id=$1", [trade.rows[0].id]);
    assert.deepEqual((await db.query<{event_type:string}>(`select event_type from evento_analitica where source_id=$1
      order by occurred_at,event_type`, [trade.rows[0].id])).rows.map(row => row.event_type),
      ['TRANSACTION_RESERVED', 'TRANSACTION_AWAITING_CONFIRMATION', 'TRANSACTION_COMPLETED']);

    await db.exec('begin');
    await db.query("select set_config('campuslink.actor_user_id',$1,true)", [owner]);
    await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA',updated_at=clock_timestamp() where id=$1", [viewer]);
    await db.exec('commit');
    await db.query('update publicacion_recurso set deleted_at=clock_timestamp() where id=$1', [publication]);
    await db.query('delete from publicacion_asignatura where publicacion_id=$1', [publication]);
    const suspension=await db.query<{actor_user_id:string}>(
      "select actor_user_id from evento_analitica where account_user_id=$1 and event_key like 'account-state:%'", [viewer]);
    assert.equal(suspension.rows.length, 1); assert.equal(suspension.rows[0].actor_user_id, owner);
    assert.deepEqual((await db.query<{subject_ids:string[]}>("select subject_ids from evento_analitica where event_type='RESOURCE_VIEWED' and resource_id=$1", [publication])).rows[0].subject_ids, [subject]);
  } finally { await db.close(); }
});
