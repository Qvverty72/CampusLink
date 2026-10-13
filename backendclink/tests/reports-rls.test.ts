import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const campus = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const migrationPath = 'src/database/supabase/migrations/20261013205238_f2_8_01_reportes_privados.sql';
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table campus (id uuid primary key); create table perfil_usuario (id uuid primary key);
    insert into campus values ('${campus}'); insert into perfil_usuario values ('${user}');`);
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  const definition = schema.match(/CREATE TABLE public\.reporte_contenido \([\s\S]*?\n\);/)?.[0];
  assert.ok(definition); await db.exec(definition);
  // A deployment may already have public grants/policies. Neither should expose evidence.
  await db.exec(`grant all on reporte_contenido to public, anon, authenticated;
    create policy old_open_read on reporte_contenido for select to authenticated using (true);
    insert into reporte_contenido (reportante_id,campus_id,entidad_tipo,entidad_id,motivo,contenido_reportado_json)
    values ('${user}','${campus}','ACTIVIDAD','abcdef012345678901234567','Privado','{"title":"Evidencia"}');`);
  const migration = await readFile(migrationPath, 'utf8');
  await db.exec(migration); await db.exec(migration);
});
after(async () => { await db.close(); });

test('report migration is repeatable, enables RLS and denies all direct public access including old permissive policies', async () => {
  assert.equal((await db.query<{ relrowsecurity: boolean }>(
    "select relrowsecurity from pg_class where oid='public.reporte_contenido'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const sql of ['select * from reporte_contenido', 'delete from reporte_contenido',
        "update reporte_contenido set estado_reporte='RESUELTO'", 'truncate reporte_contenido',
        `insert into reporte_contenido (reportante_id,campus_id,entidad_tipo,entidad_id,motivo)
          values ('${user}','${campus}','ACTIVIDAD','fake','fake')`]) {
        await assert.rejects(db.exec(sql), /permission denied/);
      }
    } finally { await db.exec('reset role'); }
  }
});

test('server role retains health/read/insert while public role has no report privileges', async () => {
  await db.exec('set role service_role');
  try {
    assert.equal((await db.query('select id from reporte_contenido')).rows.length, 1);
    await db.exec(`insert into reporte_contenido (reportante_id,campus_id,entidad_tipo,entidad_id,motivo)
      values ('${user}','${campus}','TRANSACCION','${user}','Motivo')`);
    assert.equal((await db.query('select id from reporte_contenido')).rows.length, 2);
  } finally { await db.exec('reset role'); }
});
