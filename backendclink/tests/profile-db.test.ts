import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';

const db = new PGlite();
const institution = randomUUID(), foreignInstitution = randomUUID();
const campus = randomUUID(), nextCampus = randomUUID(), foreignCampus = randomUUID();
const career = randomUUID(), secondCareer = randomUUID(), wrongCareer = randomUUID();
const migration = () => readFile('src/database/supabase/migrations/f2_3_04_perfil_academico.sql', 'utf8');
let updateAcademicProfile: typeof import('../src/modules/users/users.service.js').updateAcademicProfile;
let closePostgres: () => Promise<void>;
let releaseCount = 0;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://profile-db-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@profile-db-test.invalid/postgres' });
  // Exercise the real service/repository SQL against PGlite, replacing only transport.
  mock.method(Pool.prototype, 'connect', async () => ({
    query: (sql: string, values: unknown[] = []) => db.query(sql, values),
    release: () => { releaseCount++; },
  }));
  ({ updateAcademicProfile } = await import('../src/modules/users/users.service.js'));
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$; grant usage on schema public to anon,authenticated,service_role;");
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const name of ['institucion', 'campus', 'carrera', 'campus_carrera', 'perfil_usuario', 'usuario_carrera', 'rol', 'permiso', 'usuario_rol', 'usuario_permiso', 'publicacion_recurso']) {
    const sql = schema.match(new RegExp('CREATE TABLE public\\.' + name + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(sql, name); await db.exec(sql);
  }
  await db.exec(await readFile('src/database/supabase/migrations/f2_3_01_autenticacion.sql', 'utf8'));
  await db.exec('grant select on perfil_usuario to service_role');
  await db.query('insert into institucion(id,nombre) values ($1,$2),($3,$4)', [institution, 'Home', foreignInstitution, 'Foreign']);
  await db.query('insert into campus(id,institucion_id,nombre) values ($1,$2,$3),($4,$2,$5),($6,$7,$8)', [campus, institution, 'Old', nextCampus, 'New', foreignCampus, foreignInstitution, 'Foreign']);
  await db.query('insert into carrera(id,institucion_id,nombre) values ($1,$2,$3),($4,$2,$5),($6,$2,$7)', [career, institution, 'First', secondCareer, 'Second', wrongCareer, 'Unavailable here']);
  await db.query('insert into campus_carrera values ($1,$2),($3,$2),($3,$4),($1,$5)', [campus, career, nextCampus, secondCareer, wrongCareer]);
  // Even if previous/default grants allowed public writes, the boundary must revoke them.
  await db.exec('grant all on public.usuario_carrera to anon,authenticated');
  await db.exec(await migration());
});
after(async () => { await closePostgres(); mock.restoreAll(); await db.close(); });
async function fixture() {
  const user = randomUUID();
  await db.query('insert into auth.users values ($1)', [user]);
  await db.query("insert into perfil_usuario(id,institucion_id,campus_id,nombre_completo,verificado_en) values ($1,$2,$3,'Before',now())", [user, institution, campus]);
  await db.query('insert into usuario_carrera values ($1,$2,2024)', [user, career]);
  return user;
}
async function version(user: string) {
  return (await db.query<{ value: string }>(`select to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as value from perfil_usuario where id=$1`, [user])).rows[0].value;
}
const call = (user: string, timestamp: string, ids: string[], campusId = nextCampus, institutionId = institution) =>
  updateAcademicProfile({ userId: user, campusId: campus, roles: [], permissions: [], profile: {
    id: user, institucion_id: institutionId, campus_id: campus, nombre_completo: 'Before', foto_path: null,
    verificado_en: '2026-10-08T12:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null,
  } } satisfies VerifiedAuthConnection, { fullName: ' After ', campusId, careerIds: ids, updatedAt: timestamp });
const serverCall = call;

test('atomic multi-career save preserves retained metadata and unrelated profile fields', async () => {
  const user = await fixture();
  const original = (await db.query('select * from perfil_usuario where id=$1', [user])).rows[0];
  await db.query("insert into publicacion_recurso(campus_id,propietario_id,tipo_recurso,titulo,modalidad) values ($1,$2,'FISICO','Original publication','DONACION')", [campus, user]);
  const publications = (await db.query('select * from publicacion_recurso where propietario_id=$1', [user])).rows;
  const timestamp = await version(user);
  await serverCall(user, timestamp, [career, secondCareer]);
  const saved = (await db.query('select * from perfil_usuario where id=$1', [user])).rows[0];
  assert.equal(saved.nombre_completo, 'After'); assert.equal(saved.campus_id, nextCampus);
  assert.deepEqual((await db.query('select * from publicacion_recurso where propietario_id=$1', [user])).rows, publications);
  for (const key of Object.keys(original).filter(key => !['nombre_completo', 'campus_id', 'updated_at'].includes(key))) assert.deepEqual(saved[key], original[key], key);
  assert.notEqual(await version(user), timestamp);
  assert.deepEqual((await db.query('select carrera_id,anio_ingreso from usuario_carrera where perfil_usuario_id=$1 order by anio_ingreso nulls last', [user])).rows,
    [{ carrera_id: career, anio_ingreso: 2024 }, { carrera_id: secondCareer, anio_ingreso: null }]);
  await serverCall(user, await version(user), []);
  assert.deepEqual((await db.query('select * from usuario_carrera where perfil_usuario_id=$1', [user])).rows, []);
});

test('stale versions, foreign campus/institution, wrong offerings and duplicates preserve profile and associations', async () => {
  const user = await fixture(), timestamp = await version(user);
  const original = (await db.query('select * from perfil_usuario where id=$1', [user])).rows;
  const links = (await db.query('select * from usuario_carrera where perfil_usuario_id=$1', [user])).rows;
  for (const operation of [
    () => call(user, '2000-01-01T00:00:00Z', [career]),
    () => call(user, timestamp, [wrongCareer]),
    () => call(user, timestamp, [career, career]),
    () => call(user, timestamp, [], foreignCampus),
    () => call(user, timestamp, [], campus, foreignInstitution),
  ]) {
    await assert.rejects(operation());
    assert.deepEqual((await db.query('select * from perfil_usuario where id=$1', [user])).rows, original);
    assert.deepEqual((await db.query('select * from usuario_carrera where perfil_usuario_id=$1', [user])).rows, links);
  }
  await serverCall(user, timestamp, [career]);
  await assert.rejects(serverCall(user, timestamp, []), { status: 409 });
});

test('failure after profile update rolls back all writes', async () => {
  const user = await fixture(), timestamp = await version(user);
  // Simulate a storage failure during association insertion, after UPDATE/DELETE.
  await db.exec("create function public.fail_profile_test() returns trigger language plpgsql as $$begin raise exception 'storage failure'; end$$; create trigger fail_profile_test before insert on usuario_carrera for each row execute function fail_profile_test();");
  try {
    await assert.rejects(serverCall(user, timestamp, [secondCareer]), { status: 503 });
    assert.equal(await version(user), timestamp);
    assert.equal((await db.query('select nombre_completo,campus_id from perfil_usuario where id=$1', [user])).rows[0].nombre_completo, 'Before');
    assert.deepEqual((await db.query('select carrera_id from usuario_carrera where perfil_usuario_id=$1', [user])).rows, [{ carrera_id: career }]);
  } finally { await db.exec('drop trigger fail_profile_test on usuario_carrera; drop function public.fail_profile_test()'); }
});

test('RPC is absent and anonymous/authenticated cannot edit associations', async () => {
  assert.deepEqual((await db.query("select to_regprocedure('public.actualizar_perfil_academico(uuid,uuid,text,uuid,uuid[],timestamptz)') as rpc")).rows, [{ rpc: null }]);
  const user = await fixture();
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(db.query('delete from usuario_carrera where perfil_usuario_id=$1', [user]), /permission denied/);
      await assert.rejects(db.query('insert into usuario_carrera values ($1,$2,null)', [user, secondCareer]), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
});

test('suspended/deleted accounts and inactive catalogue cannot be saved', async () => {
  const user = await fixture();
  await db.query("update perfil_usuario set estado_cuenta='SUSPENDIDA' where id=$1", [user]);
  await assert.rejects(serverCall(user, await version(user), []), { status: 403 });
  await db.query("update perfil_usuario set estado_cuenta='ACTIVA',deleted_at=now() where id=$1", [user]);
  await assert.rejects(serverCall(user, await version(user), []), { status: 403 });
  await db.query('update perfil_usuario set deleted_at=null where id=$1', [user]);
  await db.query('update carrera set activo=false where id=$1', [secondCareer]);
  try { await assert.rejects(serverCall(user, await version(user), [secondCareer]), { status: 400 }); }
  finally { await db.query('update carrera set activo=true where id=$1', [secondCareer]); }
});

test('migration is repeatable and adds no tables/columns or history', async () => {
  const tables = (await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
  const rows = (await db.query('select * from usuario_carrera order by perfil_usuario_id,carrera_id')).rows;
  await db.exec(await migration());
  assert.deepEqual((await db.query("select table_name,column_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows, tables);
  assert.deepEqual((await db.query('select * from usuario_carrera order by perfil_usuario_id,carrera_id')).rows, rows);
});

test('version checks preserve microseconds and connections are released after failure', async () => {
  const user = await fixture();
  await db.query("update perfil_usuario set updated_at='2026-10-08T12:00:00.123456Z' where id=$1", [user]);
  const previousReleases = releaseCount;
  await assert.rejects(serverCall(user, '2026-10-08T12:00:00.123455Z', []), { status: 409 });
  assert.equal(releaseCount, previousReleases + 1);
  const saved = await serverCall(user, '2026-10-08T12:00:00.123456Z', []);
  assert.match(saved.updatedAt, /\.\d{6}Z$/);
  assert.equal(releaseCount, previousReleases + 2);
});

test('real SQL rechecks privileged roles in the current profile campus before a write', async () => {
  const user = await fixture();
  const roleId = randomUUID();
  await db.query("insert into rol(id,nombre) values ($1,'ADMINISTRADOR') on conflict(nombre) do nothing", [roleId]);
  const catalogId = (await db.query<{ id: string }>("select id from rol where nombre='ADMINISTRADOR'")).rows[0].id;
  await db.query('update perfil_usuario set verificado_en=null where id=$1', [user]);
  await db.query('insert into usuario_rol(perfil_usuario_id,rol_id,campus_id) values ($1,$2,$3)', [user,catalogId,campus]);
  const auth: VerifiedAuthConnection = { userId:user,campusId:campus,roles:[{id:catalogId,name:'ADMINISTRADOR',campusId:campus}],permissions:[],
    profile:{id:user,institucion_id:institution,campus_id:campus,nombre_completo:'Before',foto_path:null,verificado_en:null,estado_cuenta:'ACTIVA',deleted_at:null} };
  const body = { fullName:'After',campusId:campus,careerIds:[],updatedAt:await version(user) };
  await db.query('update usuario_rol set revocado_en=now() where perfil_usuario_id=$1', [user]);
  await assert.rejects(updateAcademicProfile(auth,body), { status:403 });
  assert.equal((await db.query('select nombre_completo from perfil_usuario where id=$1',[user])).rows[0].nombre_completo,'Before');
  await db.query('update usuario_rol set revocado_en=null where perfil_usuario_id=$1', [user]);
  await db.query('update perfil_usuario set campus_id=$1 where id=$2',[nextCampus,user]);
  await assert.rejects(updateAcademicProfile(auth,body), { status:403 });
  assert.equal((await db.query('select nombre_completo from perfil_usuario where id=$1',[user])).rows[0].nombre_completo,'Before');
});
