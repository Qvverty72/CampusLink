import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import { Db } from 'mongodb';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID(), foreignInstitution = randomUUID(), foreignCampus = randomUUID();
const reader = randomUUID(), token = 'analytics.test.token';
const tables = ['institucion','campus','carrera','campus_carrera','perfil_usuario','usuario_carrera','rol','permiso','usuario_rol','usuario_permiso',
  'publicacion_recurso','asignatura','carrera_asignatura','publicacion_carrera','publicacion_asignatura','mensaje_solicitud','solicitud_recurso',
  'interaccion_recurso','reporte_contenido','auditoria'];
const client = { query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as PoolClient;
const start = new Date('2026-10-10T00:00:00Z'), until = new Date('2026-10-11T00:00:00Z');
let server: Server, base: string, sqlFailure = false, mongoFailure = false, mongoReads = 0, invalidAuth = false;
let events: { campusId: string; userId?: string; occurredAt: Date; type: string; provenance?: string }[] = [];
let readMetrics: typeof import('../src/modules/analytics/analytics.repository.js').readDashboardMetrics;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://dashboard-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@dashboard-test.invalid/postgres' });
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const table of tables) {
    const ddl = schema.match(new RegExp('CREATE TABLE public\\.' + table + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(ddl, table); await db.exec(ddl);
  }
  mock.method(Pool.prototype, 'connect', async () => ({ query: (sql: string, params?: unknown[]) => {
    if (sqlFailure && !['BEGIN', 'ROLLBACK'].includes(sql)) throw new Error('private SQL credentials');
    return db.query(sql, params);
  }, release() {} }));
  mock.method(Db.prototype, 'collection', (name: string) => ({ aggregate: (pipeline: any[]) => {
    assert.equal(name, 'activity_interactions'); mongoReads++;
    if (mongoFailure) throw new Error('private MongoDB credentials');
    const match = pipeline[0].$match;
    assert.deepEqual(match.type.$in, ['VIEWED', 'JOINED', 'LEFT']);
    const groups = new Map<string, { _id: string; count: number; legacy: number }>();
    for (const event of events.filter(row => (typeof match.campusId === 'string' ? row.campusId === match.campusId : match.campusId.$in.includes(row.campusId))
      && (!match.userId || match.userId.$in.includes(row.userId)) && row.occurredAt >= match.occurredAt.$gte
      && row.occurredAt < match.occurredAt.$lt && match.type.$in.includes(row.type))) {
      const group = groups.get(event.type) ?? { _id: event.type, count: 0, legacy: 0 };
      group.count++; if (event.provenance === 'LEGACY_STATE') group.legacy++; groups.set(event.type, group);
    }
    return { toArray: async () => [...groups.values()] };
  } }));
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://dashboard-test.invalid');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    if (url.pathname === '/auth/v1/user') return invalidAuth ? Response.json({ code: 'bad_jwt' }, { status: 401 })
      : Response.json({ id: reader, email: 'reader@duocuc.cl', email_confirmed_at: '2026-01-01T00:00:00Z' });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json((await db.query('SELECT * FROM perfil_usuario WHERE id=$1', [reader])).rows);
    const kind = url.pathname.endsWith('/usuario_rol') ? 'rol' : 'permiso';
    assert.equal(url.searchParams.get('revocado_en'), 'is.null');
    return Response.json((await db.query(`SELECT link.campus_id,json_build_object('id',cat.id,'nombre',cat.nombre) AS ${kind}
      FROM usuario_${kind} link JOIN ${kind} cat ON cat.id=link.${kind}_id
      WHERE link.perfil_usuario_id=$1 AND link.revocado_en IS NULL`, [reader])).rows);
  };
  ({ readDashboardMetrics: readMetrics } = await import('../src/modules/analytics/analytics.repository.js'));
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/analytics/dashboard';
});

beforeEach(async () => {
  sqlFailure = false; mongoFailure = false; invalidAuth = false; mongoReads = 0; events = [];
  await db.exec('TRUNCATE ' + tables.join(',') + ',auth.users CASCADE');
  await db.query("INSERT INTO institucion(id,nombre) VALUES($1,'Institución'),($2,'Ajena')", [institution, foreignInstitution]);
  await db.query("INSERT INTO campus(id,institucion_id,nombre) VALUES($1,$4,'Principal'),($2,$4,'Otra'),($3,$5,'Ajena')",
    [campus, otherCampus, foreignCampus, institution, foreignInstitution]);
  await profile(reader);
  await grant('ADMINISTRADOR');
});

after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const { closePostgres } = await import('../src/database/supabase/postgres.js'); await closePostgres();
  const { closeMongoDB } = await import('../src/database/mongodb/client.js'); await closeMongoDB();
  await db.close();
});

async function profile(id = randomUUID(), state = 'ACTIVA', created = '2026-01-01T00:00:00Z', at = campus) {
  await db.query('INSERT INTO auth.users VALUES($1)', [id]);
  await db.query(`INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,estado_cuenta,created_at,verificado_en)
    VALUES($1,$2,$3,'Perfil',$4,$5,$5)`, [id, institution, at, state, created]);
  return id;
}
async function grant(name: string, at = campus, kind = 'rol') {
  const catalog = (await db.query<{ id: string }>(`INSERT INTO ${kind}(nombre) VALUES($1)
    ON CONFLICT(nombre) DO UPDATE SET nombre=excluded.nombre RETURNING id`, [name])).rows[0].id;
  await db.query(`INSERT INTO usuario_${kind}(perfil_usuario_id,${kind}_id,campus_id) VALUES($1,$2,$3)`, [reader, catalog, at]);
}
async function change(user: string, before: string, after: string, when: string, at = campus) {
  const action = after === 'ACTIVA' ? 'REACTIVAR_CUENTA' : after === 'SUSPENDIDA' ? 'SUSPENDER_CUENTA' : 'DESACTIVAR_CUENTA';
  await db.query(`INSERT INTO auditoria(institucion_id,campus_id,entidad_tipo,entidad_id,accion,datos_antes,datos_despues,created_at)
    VALUES($1,$2,'perfil_usuario',$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [institution, at, user, action, JSON.stringify({ estado_cuenta: before }), JSON.stringify({ estado_cuenta: after }), when]);
}
async function publication(at = campus, type = 'FISICO') {
  return (await db.query<{ id: string }>(`INSERT INTO publicacion_recurso(campus_id,propietario_id,tipo_recurso,titulo,modalidad,deleted_at)
    VALUES($1,$2,$3,'Retirado','DONACION',now()) RETURNING id`, [at, reader, type])).rows[0].id;
}
async function view(id: string, when: string, type = 'VISTA') {
  await db.query('INSERT INTO interaccion_recurso(perfil_usuario_id,publicacion_id,tipo_interaccion,created_at) VALUES($1,$2,$3,$4)', [reader, id, type, when]);
}
async function requestResource(id: string, when: string) {
  await db.query("INSERT INTO mensaje_solicitud(codigo,descripcion) VALUES('TEST','Solicitud') ON CONFLICT DO NOTHING");
  await db.query(`INSERT INTO solicitud_recurso(publicacion_id,solicitante_id,codigo_mensaje,solicitada_en,estado_solicitud)
    VALUES($1,$2,'TEST',$3,'CANCELADA')`, [id, reader, when]);
}
const request = (query = 'from=2026-10-10&to=2026-10-10', authorization = 'Bearer ' + token) =>
  originalFetch(base + '?' + query, { headers: { Authorization: authorization } });

test('account cutoff reconstructs past states, creation/deletion and exact boundary without requiring a creation event', async () => {
  const suspended = await profile(undefined, 'SUSPENDIDA');
  await change(suspended, 'ACTIVA', 'SUSPENDIDA', '2026-10-12T12:00:00Z', otherCampus);
  const reactivated = await profile();
  await change(reactivated, 'ACTIVA', 'SUSPENDIDA', '2026-10-09T12:00:00Z');
  await change(reactivated, 'SUSPENDIDA', 'ACTIVA', '2026-10-12T12:00:00Z');
  const active = await profile();
  await change(active, 'ACTIVA', 'SUSPENDIDA', '2026-10-08T12:00:00Z');
  await change(active, 'SUSPENDIDA', 'ACTIVA', '2026-10-10T23:59:59.999999Z');
  const boundary = await profile(undefined, 'DESACTIVADA');
  await change(boundary, 'ACTIVA', 'DESACTIVADA', '2026-10-11T00:00:00Z');
  const deletedAfter = await profile();
  await db.query("UPDATE perfil_usuario SET deleted_at='2026-10-12' WHERE id=$1", [deletedAfter]);
  const deletedBefore = await profile();
  await db.query("UPDATE perfil_usuario SET deleted_at='2026-10-09' WHERE id=$1", [deletedBefore]);
  await profile(undefined, 'ACTIVA', '2026-10-11T00:00:00Z');
  await profile(undefined, 'ACTIVA', undefined, otherCampus);
  assert.equal((await readMetrics(client, campus, institution, start, until))?.activeUsers, 5);
  assert.equal((await readMetrics(client, campus, institution, start, new Date('2026-10-13')))?.activeUsers, 4);
});

test('resource and subject SQL distinguish facts, retain logical deletions, use half-open microsecond bounds and avoid fan-out', async () => {
  const physical = await publication(), digital = await publication(campus, 'DIGITAL'), other = await publication(otherCampus);
  const subjectA = randomUUID(), subjectB = randomUUID();
  await db.query("INSERT INTO asignatura(id,codigo,nombre,activo) VALUES($1,'A','Álgebra',false),($2,'B','Física',true)", [subjectA, subjectB]);
  await db.query('INSERT INTO publicacion_asignatura VALUES($1,$2),($1,$3)', [physical, subjectA, subjectB]);
  await view(physical, '2026-10-10T00:00:00Z'); await requestResource(physical, '2026-10-10T12:00:00Z');
  await view(physical, '2026-10-10T23:59:59.999999Z');
  await view(digital, '2026-10-10T11:00:00Z'); await requestResource(digital, '2026-10-10T11:00:00Z');
  await view(physical, '2026-10-11T00:00:00Z'); await requestResource(physical, '2026-10-11T00:00:00Z');
  await view(physical, '2026-10-09T23:59:59.999999Z');
  await view(other, '2026-10-10T00:00:00Z'); await requestResource(other, '2026-10-10T00:00:00Z');
  await view(physical, '2026-10-10T12:00:00Z', 'CLIC');
  await db.query("UPDATE perfil_usuario SET estado_cuenta='DESACTIVADA',deleted_at=now() WHERE id=$1", [reader]);
  const result = await readMetrics(client, campus, institution, start, until);
  assert.deepEqual(result?.resourceDemand, { views: 3, requests: 2 });
  assert.deepEqual(result?.subjectDemand.map(row => [row.subjectName, row.views, row.requests]), [['Física', 2, 1], ['Álgebra', 2, 1]]);
  const next = await readMetrics(client, campus, institution, until, new Date('2026-10-12'));
  assert.deepEqual(next?.resourceDemand, { views: 1, requests: 1 });
  assert.equal(await readMetrics(client, campus, foreignInstitution, start, until), null);
});

test('HTTP returns four scoped KPI; JOINED events survive LEFT without reading current activities', async () => {
  const id = await publication(); await view(id, '2026-10-10T10:00:00Z');
  events = [
    { campusId: campus, occurredAt: start, type: 'JOINED' },
    { campusId: campus, occurredAt: new Date('2026-10-10T12:00:00Z'), type: 'LEFT' },
    { campusId: campus, occurredAt: new Date('2026-10-10T13:00:00Z'), type: 'JOINED', provenance: 'LEGACY_STATE' },
    { campusId: campus, occurredAt: start, type: 'VIEWED' },
    { campusId: otherCampus, occurredAt: start, type: 'JOINED' },
    { campusId: campus, occurredAt: until, type: 'JOINED' },
  ];
  const response = await request(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { data } = await response.json();
  assert.deepEqual(data.period, { from: '2026-10-10', to: '2026-10-10', timeZone: 'UTC', cutoff: until.toISOString() });
  for (const key of ['activeUsers', 'resourceDemand', 'subjectDemand', 'activityParticipation']) {
    assert.equal(data[key].scope.campusId, campus); assert.equal(data[key].scope.institutionId, institution);
    assert.deepEqual(data[key].period, data.period); assert.equal(typeof data[key].value, 'number');
  }
  assert.equal(data.resourceDemand.value, 1); assert.equal(data.resourceDemand.views, 1); assert.equal(data.resourceDemand.requests, 0);
  assert.equal(data.activityParticipation.value, 2); assert.equal(data.activityParticipation.legacyEvents, 1);
  assert.equal(data.activityParticipation.label, 'Inscripciones registradas'); assert.ok(data.notes.length);
});

test('HTTP rereads reporting grants; analytics alone, grant without role, revoked/foreign grants and inactive accounts deny access', async () => {
  assert.equal((await request(undefined, '')).status, 401);
  invalidAuth = true; assert.equal((await request()).status, 401); invalidAuth = false;
  await db.exec('DELETE FROM usuario_rol'); await grant('USUARIO_AUTORIZADO'); await grant('ACCEDER_ANALITICA', campus, 'permiso');
  assert.equal((await request()).status, 403);
  await grant('ACCEDER_REPORTERIA', campus, 'permiso'); assert.equal((await request()).status, 200);
  await db.exec('UPDATE usuario_permiso SET revocado_en=now()'); assert.equal((await request()).status, 403);
  await grant('ACCEDER_REPORTERIA', otherCampus, 'permiso'); assert.equal((await request()).status, 403);
  await db.exec('DELETE FROM usuario_rol'); await grant('ACCEDER_REPORTERIA', campus, 'permiso');
  assert.equal((await request()).status, 403);
  await grant('ADMINISTRADOR');
  for (const state of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$1 WHERE id=$2', [state, reader]);
    assert.equal((await request()).status, 403);
  }
});

test('HTTP scopes every query to an authorized active campus in the same institution before reading Mongo', async () => {
  assert.equal((await request('from=2026-10-10&to=2026-10-10&campusId=' + otherCampus)).status, 403);
  assert.equal(mongoReads, 0);
  await grant('ADMINISTRADOR', foreignCampus);
  assert.equal((await request('from=2026-10-10&to=2026-10-10&campusId=' + foreignCampus)).status, 403);
  assert.equal(mongoReads, 0);
  await grant('ADMINISTRADOR', otherCampus);
  assert.equal((await request('from=2026-10-10&to=2026-10-10&campusId=' + otherCampus)).status, 200);
  await db.query('UPDATE campus SET activo=false WHERE id=$1', [campus]);
  assert.equal((await request()).status, 403);
});

test('strict dates and filters reject invalid calendar dates, array/object parameters, reversed periods and spoofed scope', async () => {
  for (const query of ['', 'from=2026-02-30&to=2026-03-01', 'from=2026-10-11&to=2026-10-10',
    'from=2026-10-10&to=2026-10-10&campusId=invalid', 'from=2026-10-10&from=2026-10-09&to=2026-10-10',
    'from[x]=2026-10-10&to=2026-10-10', 'from=0000-01-01&to=2026-10-10',
    'from=2026-10-10&to=2026-10-10&institutionId=bad',
    'from=2026-10-10&to=2026-10-10&campusIds=',
    'from=2026-10-10&to=2026-10-10&campusIds=' + campus + ',bad',
    'from=2026-10-10&to=2026-10-10&campusIds=' + campus + '&campusIds=' + otherCampus,
    'from=2026-10-10&to=2026-10-10&campusId=' + campus + '&campusIds=' + campus,
    'from=2026-10-10&to=2026-10-10&careerId=bad']) {
    assert.equal((await request(query)).status, 400, query);
  }
  assert.equal(mongoReads, 0);
  assert.equal((await request('from=2024-02-29&to=2024-02-29')).status, 200);
});

test('empty periods produce genuine zeroes; either database failure returns sanitized 503 without partial KPI', async () => {
  const response = await request(); assert.equal(response.status, 200); const { data } = await response.json();
  assert.equal(data.resourceDemand.value, 0); assert.equal(data.subjectDemand.value, 0);
  assert.deepEqual(data.subjectDemand.subjects, []); assert.equal(data.activityParticipation.value, 0);
  for (const dependency of ['SQL', 'MongoDB']) {
    sqlFailure = dependency === 'SQL'; mongoFailure = dependency === 'MongoDB';
    const failed = await request(); assert.equal(failed.status, 503);
    const body = await failed.text(); assert.doesNotMatch(body, /private|credentials|"activeUsers"/);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
  }
});

async function academicFixtures() {
  const career = randomUUID(), secondCareer = randomUUID(), foreignCareer = randomUUID(), unavailableCareer = randomUUID();
  await db.query(`INSERT INTO carrera(id,institucion_id,nombre) VALUES
    ($1,$5,'Informática'),($2,$5,'Diseño'),($3,$6,'Ajena'),($4,$5,'Solo otra sede')`,
    [career, secondCareer, foreignCareer, unavailableCareer, institution, foreignInstitution]);
  await db.query(`INSERT INTO campus_carrera VALUES($1,$4),($2,$4),($1,$5),($3,$6),($2,$7)`,
    [campus, otherCampus, foreignCampus, career, secondCareer, foreignCareer, unavailableCareer]);
  return { career, secondCareer, foreignCareer, unavailableCareer };
}

test('options expose only current reporting campuses and their institution/careers, including grants outside profile campus', async () => {
  const { career, unavailableCareer } = await academicFixtures();
  const optionsRequest = () => originalFetch(base.replace('/dashboard', '/options'), { headers: { Authorization: 'Bearer ' + token } });
  let response = await optionsRequest(); assert.equal(response.status, 200);
  let options = (await response.json()).data;
  assert.equal(options.institutions.length, 1); assert.equal(options.institutions[0].id, institution);
  assert.deepEqual(options.institutions[0].campuses.map((c: any) => c.id), [campus]);
  assert.ok(!options.institutions[0].careers.some((c: any) => c.id === unavailableCareer));
  assert.deepEqual(options.institutions[0].careers.find((c: any) => c.id === career).campusIds, [campus]);
  await grant('ADMINISTRADOR', foreignCampus); // Una asignación inconsistente no abre otra institución.
  await grant('ADMINISTRADOR', otherCampus);
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE campus_id=$1', [campus]);
  response = await optionsRequest(); assert.equal(response.status, 200); options = (await response.json()).data;
  assert.deepEqual(options.institutions[0].campuses.map((c: any) => c.id), [otherCampus]);
  await db.query('UPDATE campus SET activo=false WHERE id=$1', [otherCampus]);
  assert.equal((await optionsRequest()).status, 403);
  await db.query('UPDATE campus SET activo=true WHERE id=$1', [otherCampus]);
  sqlFailure = true; assert.equal((await optionsRequest()).status, 503);
});

test('multi-campus and career filters apply to all KPI with current associations and no relationship fan-out', async () => {
  const { career, secondCareer } = await academicFixtures();
  await grant('ADMINISTRADOR', otherCampus);
  const member = await profile(), otherMember = await profile(undefined, 'DESACTIVADA', undefined, otherCampus);
  await change(otherMember, 'ACTIVA', 'DESACTIVADA', '2026-10-12');
  await db.query('INSERT INTO usuario_carrera(perfil_usuario_id,carrera_id) VALUES($1,$3),($1,$4),($2,$3)',
    [member, otherMember, career, secondCareer]);
  const resource = await publication(), otherResource = await publication(otherCampus), excludedResource = await publication();
  await db.query('INSERT INTO publicacion_carrera VALUES($1,$3),($1,$4),($2,$3)', [resource, otherResource, career, secondCareer]);
  const shared = randomUUID(), unrelated = randomUUID();
  await db.query("INSERT INTO asignatura(id,nombre,codigo,activo) VALUES($1,'Compartida','SHARED',false),($2,'Otra','OTHER',true)", [shared, unrelated]);
  await db.query('INSERT INTO carrera_asignatura VALUES($1,$3,1),($2,$3,1),($2,$4,1)', [career, secondCareer, shared, unrelated]);
  await db.query('INSERT INTO publicacion_asignatura VALUES($1,$3),($1,$4),($2,$3)', [resource, otherResource, shared, unrelated]);
  await view(resource, '2026-10-10T12:00Z'); await requestResource(resource, '2026-10-10T12:00Z');
  await view(otherResource, '2026-10-10T23:59:59.999999Z'); await view(excludedResource, '2026-10-10T12:00Z');
  events = [
    { campusId: campus, userId: member, occurredAt: start, type: 'JOINED' },
    { campusId: campus, userId: member, occurredAt: start, type: 'LEFT' },
    { campusId: otherCampus, userId: otherMember, occurredAt: start, type: 'JOINED', provenance: 'LEGACY_STATE' },
    { campusId: campus, userId: reader, occurredAt: start, type: 'JOINED' },
    { campusId: foreignCampus, userId: member, occurredAt: start, type: 'JOINED' },
    { campusId: campus, userId: member, occurredAt: until, type: 'JOINED' },
  ];
  const filters = `from=2026-10-10&to=2026-10-10&institutionId=${institution}&campusIds=${campus},${otherCampus},${campus}`;
  const response = await request(filters + '&careerId=' + career); assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.activeUsers.value, 2); assert.deepEqual([data.resourceDemand.views, data.resourceDemand.requests], [2, 1]);
  assert.deepEqual(data.subjectDemand.subjects.map((s: any) => [s.subjectId, s.views, s.requests]), [[shared, 2, 1], [unrelated, 1, 1]]);
  assert.equal(data.activityParticipation.value, 2); assert.equal(data.activityParticipation.legacyEvents, 1);
  assert.equal(data.scope.campusId, null); assert.equal(data.scope.campuses.length, 2); assert.equal(data.scope.career.id, career);
  for (const metric of ['activeUsers','resourceDemand','subjectDemand','activityParticipation']) assert.deepEqual(data[metric].scope, data.scope);
  assert.ok(data.notes.some((n: string) => n.includes('no deben sumarse')));
  const all = (await (await request(filters)).json()).data;
  assert.equal(all.resourceDemand.views, 3); assert.equal(all.activityParticipation.value, 3);
  const other = (await (await request(filters + '&careerId=' + secondCareer)).json()).data;
  assert.equal(other.activeUsers.value, 1); assert.equal(other.resourceDemand.views, 1); assert.equal(other.activityParticipation.value, 1);
  // Las mismas personas/recursos pueden aparecer en otra carrera. Cambios posteriores afectan consultas dinámicas.
  await db.query('DELETE FROM usuario_carrera WHERE carrera_id=$1', [career]);
  await db.query('DELETE FROM publicacion_carrera WHERE carrera_id=$1', [career]);
  const changed = (await (await request(filters + '&careerId=' + career)).json()).data;
  assert.equal(changed.activeUsers.value, 0); assert.equal(changed.resourceDemand.value, 0); assert.equal(changed.activityParticipation.value, 0);
});

test('mixed unauthorized/inactive campuses, foreign institution and invalid career scope are rejected before Mongo reads', async () => {
  const { foreignCareer, unavailableCareer } = await academicFixtures();
  const filter = `from=2026-10-10&to=2026-10-10`;
  for (const suffix of [`&campusIds=${campus},${otherCampus}`, `&institutionId=${foreignInstitution}`,
    `&careerId=${foreignCareer}`, `&careerId=${unavailableCareer}`, `&careerId=${randomUUID()}`]) {
    assert.equal((await request(filter + suffix)).status, 403, suffix);
  }
  assert.equal(mongoReads, 0);
  await grant('ADMINISTRADOR', otherCampus);
  assert.equal((await request(filter + '&careerId=' + unavailableCareer + '&campusIds=' + campus + ',' + otherCampus)).status, 200);
  await db.query('UPDATE campus SET activo=false WHERE id=$1', [otherCampus]);
  mongoReads = 0;
  assert.equal((await request(filter + '&campusIds=' + campus + ',' + otherCampus)).status, 403);
  assert.equal(mongoReads, 0);
});

test('direct digital careers need not be offered at origin campus, and independent subjects and inactive academic links remain reportable', async () => {
  const { unavailableCareer } = await academicFixtures();
  const digital = await publication(campus, 'DIGITAL'), subject = randomUUID();
  await db.query('INSERT INTO publicacion_carrera VALUES($1,$2)', [digital, unavailableCareer]);
  await db.query("INSERT INTO asignatura(id,codigo,nombre,activo) VALUES($1,'INDEPENDENT','Directa',false)", [subject]);
  await db.query('INSERT INTO publicacion_asignatura VALUES($1,$2)', [digital, subject]);
  await db.query('UPDATE carrera SET activo=false WHERE id=$1', [unavailableCareer]);
  await view(digital, '2026-10-10T12:00Z');
  const response = await request('from=2026-10-10&to=2026-10-10&careerId=' + unavailableCareer);
  assert.equal(response.status, 200); const { data } = await response.json();
  assert.equal(data.resourceDemand.views, 1); assert.equal(data.subjectDemand.value, 1);
  assert.equal(data.subjectDemand.subjects[0].subjectId, subject);
  assert.equal(data.scope.campusId, campus); assert.equal(data.scope.career.id, unavailableCareer);
});
