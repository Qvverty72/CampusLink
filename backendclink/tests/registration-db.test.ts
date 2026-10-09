import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const duoc = randomUUID();
const otherInstitution = randomUUID();
const campus = randomUUID();
const foreign = randomUUID();
async function prepare(target: PGlite) {
  await target.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');");
  await target.exec("create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;");
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'perfil_usuario', 'rol', 'permiso', 'usuario_rol', 'usuario_permiso', 'dominio_institucional']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await target.exec(sql);
  }
  await target.exec(await readFile('src/database/supabase/migrations/f2_3_01_autenticacion.sql', 'utf8'));
  assert.equal((await target.query("select to_regclass('public.dominio_institucional') as existing_domain_table")).rows[0]?.existing_domain_table, 'dominio_institucional');
  assert.equal((await target.query("select to_regclass('public.registro_institucional_pendiente') as pending_table")).rows[0]?.pending_table, null);
  await target.query('insert into institucion(id,nombre) values ($1,$2),($3,$4)', [duoc, 'DUOC UC', otherInstitution, 'Other']);
  await target.query('insert into campus(id,institucion_id,nombre) values ($1,$2,$3),($4,$5,$6)', [campus, duoc, 'San Andres', foreign, otherInstitution, 'Foreign']);
}
async function migrate(target = db) {
  await target.exec(await readFile('src/database/supabase/migrations/f2_3_02_registro.sql', 'utf8'));
}
before(async () => { await prepare(db); await migrate(); });
after(async () => { await db.close(); });
async function authUser(target = db) {
  const id = randomUUID();
  await target.query('insert into auth.users(id,email) values ($1,$2)', [id, id + '@duocuc.cl']);
  return id;
}

test('migration maps the admitted domain to the existing DuocUC institution', async () => {
  assert.deepEqual((await db.query('select dominio,institucion_id from dominio_institucional')).rows, [{ dominio: 'duocuc.cl', institucion_id: duoc }]);
});
test('public clients cannot read/change domains or write profiles', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    try {
      for (const sql of ['select * from dominio_institucional', 'update dominio_institucional set activo=false',
        "update perfil_usuario set estado_cuenta='ACTIVA'",
        "insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo) values (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'X')"]) {
        await assert.rejects(db.exec(sql), /permission denied/);
      }
    } finally { await db.exec('reset role'); }
  }
});
test('Auth confirmation and user metadata do not write the existing profile automatically', async () => {
  const id = await authUser();
  await db.query("update auth.users set email_confirmed_at=now(), raw_user_meta_data=$2 where id=$1", [id, JSON.stringify({ nombre_completo: 'Test User', campus_id: campus, roles: ['ADMINISTRADOR'] })]);
  assert.deepEqual((await db.query('select id from perfil_usuario where id=$1', [id])).rows, []);
});
test('profile PK and composite FK protect institutional campus integrity', async () => {
  const id = await authUser();
  await assert.rejects(db.query('insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo) values ($1,$2,$3,$4)', [id, duoc, foreign, 'Wrong']), /foreign key constraint/);
  await db.query('insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo) values ($1,$2,$3,$4)', [id, duoc, campus, 'Valid']);
  await assert.rejects(db.query('insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo) values ($1,$2,$3,$4)', [id, duoc, campus, 'Duplicate']), /unique constraint/);
});
test('reapplying migration preserves profiles, the domain table and existing institution', async () => {
  const repeated = new PGlite();
  try {
    await prepare(repeated);
    // Simulate the empty table created by the earlier F2.3-02 migration.
    await repeated.exec('create table public.registro_institucional_pendiente(id integer primary key)');
    await migrate(repeated);
    assert.equal((await repeated.query("select to_regclass('public.registro_institucional_pendiente') as table_name")).rows[0]?.table_name, null);
    const id = await authUser(repeated);
    await repeated.query('insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo) values ($1,$2,$3,$4)', [id, duoc, campus, 'Profile']);
    const institutions = (await repeated.query('select id,nombre from institucion order by id')).rows;
    const domainTable = (await repeated.query("select to_regclass('public.dominio_institucional') as table_name")).rows;
    const profiles = (await repeated.query('select * from perfil_usuario')).rows;
    await migrate(repeated);
    assert.deepEqual((await repeated.query('select id,nombre from institucion order by id')).rows, institutions);
    assert.deepEqual((await repeated.query("select to_regclass('public.dominio_institucional') as table_name")).rows, domainTable);
    assert.deepEqual((await repeated.query('select * from perfil_usuario')).rows, profiles);
    assert.equal((await repeated.query("select to_regclass('public.registro_institucional_pendiente') as table_name")).rows[0]?.table_name, null);
    assert.deepEqual((await repeated.query('select dominio,institucion_id from dominio_institucional')).rows, [{ dominio: 'duocuc.cl', institucion_id: duoc }]);
  } finally { await repeated.close(); }
});
test('migration preserves rows in the previous temporary table and aborts cleanup', async () => {
  const populated = new PGlite();
  try {
    await prepare(populated);
    await populated.exec('create table public.registro_institucional_pendiente(id integer primary key); insert into public.registro_institucional_pendiente values (1)');
    await assert.rejects(migrate(populated), /Temporary registration table contains 1 rows/);
    await populated.exec('rollback');
    assert.equal((await populated.query("select to_regclass('public.registro_institucional_pendiente') as table_name")).rows[0]?.table_name, 'registro_institucional_pendiente');
    assert.deepEqual((await populated.query('select id from public.registro_institucional_pendiente')).rows, [{ id: 1 }]);
  } finally { await populated.close(); }
});
