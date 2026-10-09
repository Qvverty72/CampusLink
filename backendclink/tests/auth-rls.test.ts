import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const campus = '33333333-3333-4333-8333-333333333333';
const institution = '44444444-4444-4444-8444-444444444444';
const ownRole = '55555555-5555-4555-8555-555555555555';
const otherRole = '66666666-6666-4666-8666-666666666666';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'perfil_usuario', 'rol', 'permiso', 'usuario_rol', 'usuario_permiso']) {
    const sql = schema.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(sql, name);
    await db.exec(sql);
  }
  // The new restrictive boundary must also resist an older permissive read policy.
  await db.exec('alter table perfil_usuario enable row level security; create policy older_open_read on perfil_usuario for select to authenticated using (true);');
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_01_autenticacion.sql', 'utf8'));
  await db.exec(`
    insert into auth.users values ('${alice}'), ('${bob}');
    insert into institucion (id,nombre) values ('${institution}', 'Test');
    insert into campus (id,institucion_id,nombre) values ('${campus}', '${institution}', 'Test');
    insert into perfil_usuario (id,institucion_id,campus_id,nombre_completo) values
      ('${alice}', '${institution}', '${campus}', 'Alice'), ('${bob}', '${institution}', '${campus}', 'Bob');
    insert into rol (id,nombre) values ('${ownRole}', 'Own role'), ('${otherRole}', 'Other role');
    insert into permiso (id,nombre) values ('${ownRole}', 'Own permission'), ('${otherRole}', 'Other permission');
    insert into usuario_rol (perfil_usuario_id,rol_id,campus_id) values
      ('${alice}', '${ownRole}', '${campus}'), ('${bob}', '${otherRole}', '${campus}');
    insert into usuario_permiso (perfil_usuario_id,permiso_id,campus_id) values
      ('${alice}', '${ownRole}', '${campus}'), ('${bob}', '${otherRole}', '${campus}');
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${alice}', false);
  `);
});
after(async () => { await db.close(); });

test('RLS exposes only own profile, assignments and assigned catalog names', async () => {
  assert.deepEqual((await db.query('select id from perfil_usuario')).rows, [{ id: alice }]);
  assert.deepEqual((await db.query('select perfil_usuario_id from usuario_rol')).rows, [{ perfil_usuario_id: alice }]);
  assert.deepEqual((await db.query('select perfil_usuario_id from usuario_permiso')).rows, [{ perfil_usuario_id: alice }]);
  assert.deepEqual((await db.query('select id from rol')).rows, [{ id: ownRole }]);
  assert.deepEqual((await db.query('select id from permiso')).rows, [{ id: ownRole }]);
  assert.deepEqual((await db.query(`select id from perfil_usuario where id = '${bob}'`)).rows, []);
});

test('public clients cannot change account state or grant/revoke privileges', async () => {
  for (const sql of [
    "update perfil_usuario set estado_cuenta = 'ACTIVA'",
    `insert into usuario_rol (perfil_usuario_id,rol_id,campus_id) values ('${alice}', '${otherRole}', '${campus}')`,
    `insert into usuario_permiso (perfil_usuario_id,permiso_id,campus_id) values ('${alice}', '${otherRole}', '${campus}')`,
    'delete from usuario_permiso', 'update rol set nombre = \'ADMINISTRADOR\'', 'delete from permiso',
  ]) await assert.rejects(db.exec(sql), /permission denied/);
});

test('revocations immediately remove own assignments and names', async () => {
  await db.exec(`reset role; update usuario_rol set revocado_en = now() where perfil_usuario_id = '${alice}';
    update usuario_permiso set revocado_en = now() where perfil_usuario_id = '${alice}'; set role authenticated;`);
  for (const table of ['usuario_rol', 'usuario_permiso', 'rol', 'permiso']) {
    assert.deepEqual((await db.query('select * from ' + table)).rows, []);
  }
});

test('anonymous requests and authenticated requests without an identity cannot read profiles', async () => {
  await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  assert.deepEqual((await db.query('select * from perfil_usuario')).rows, []);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from perfil_usuario'), /permission denied/);
});
