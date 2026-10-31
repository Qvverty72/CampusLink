import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';
import { Db } from 'mongodb';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

const db = new PGlite(), originalFetch = globalThis.fetch;
const institution = randomUUID(), campus = randomUUID(), otherCampus = randomUUID(), foreignInstitution = randomUUID(), foreignCampus = randomUUID();
const reader = randomUUID(), token = 'analytics.test.token';
const tables = ['institucion','campus','carrera','campus_carrera','perfil_usuario','usuario_carrera','rol','permiso','usuario_rol','usuario_permiso',
  'publicacion_recurso','asignatura','carrera_asignatura','publicacion_carrera','publicacion_asignatura','mensaje_solicitud','solicitud_recurso',
  'interaccion_recurso','reporte_contenido','auditoria','reporte'];
const client = { query: (sql: string, params?: unknown[]) => db.query(sql, params) } as unknown as PoolClient;
const start = new Date('2026-10-10T00:00:00Z'), until = new Date('2026-10-11T00:00:00Z');
const localStart = new Date('2026-10-10T03:00:00Z'), localUntil = new Date('2026-10-11T03:00:00Z');
let server: Server, base: string, sqlFailure = false, mongoFailure = false, mongoReads = 0, metricReads = 0, invalidAuth = false;
let reportWriteFailure = false, reportCommitFailure = false, viewer = reader;
let afterCalculation: (() => Promise<void>) | undefined;
let afterSnapshotRead: (() => Promise<void>) | undefined;
let statements: string[] = [];
let events: { campusId: string; userId?: string; occurredAt: Date; type: string; provenance?: string }[] = [];
let readMetrics: typeof import('../src/modules/analytics/analytics.repository.js').readDashboardMetrics;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', RATE_LIMIT_WRITE_MAX: '10000',
    SUPABASE_URL: 'https://dashboard-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@dashboard-test.invalid/postgres' });
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);');
  const schema = await readFile('src/database/supabase/migrations/CampusLink_Schema.sql', 'utf8');
  for (const table of tables) {
    const ddl = schema.match(new RegExp('CREATE TABLE public\\.' + table + ' \\([\\s\\S]*?\\n\\);'))?.[0];
    assert.ok(ddl, table); await db.exec(ddl);
  }
  mock.method(Pool.prototype, 'connect', async () => ({ query: (sql: string, params?: unknown[]) => {
    statements.push(sql);
    if (sqlFailure && !['BEGIN', 'ROLLBACK'].includes(sql)) throw new Error('private SQL credentials');
    if (reportWriteFailure && sql.includes('INSERT INTO public.reporte(')) throw new Error('private report write details');
    if (reportCommitFailure && sql === 'COMMIT' && statements.some(sql => sql.includes('INSERT INTO public.reporte('))) throw new Error('private commit details');
    if (sql.includes('jsonb_to_recordset')) metricReads++;
    const result = db.query(sql, params);
    return sql.includes('SELECT snapshot_json FROM public.reporte') && afterSnapshotRead
      ? result.then(async rows => { await afterSnapshotRead?.(); return rows; }) : result;
  }, release() {} }));
  mock.method(Db.prototype, 'collection', (name: string) => ({ aggregate: (pipeline: any[]) => {
    assert.equal(name, 'activity_interactions'); mongoReads++;
    if (mongoFailure) throw new Error('private MongoDB credentials');
    const match = pipeline[0].$match;
    assert.deepEqual(match.type.$in, ['VIEWED', 'JOINED', 'LEFT']);
    const selected = events.filter(row => (typeof match.campusId === 'string' ? row.campusId === match.campusId : match.campusId.$in.includes(row.campusId))
      && (!match.userId || match.userId.$in.includes(row.userId)) && row.occurredAt >= match.occurredAt.$gte
      && row.occurredAt < match.occurredAt.$lt && match.type.$in.includes(row.type));
    const group = (rows: typeof events, period?: (event: typeof events[number]) => string) => {
      const groups = new Map<string, { _id: any; count: number; legacy: number }>();
      for (const event of rows) {
        const bucket = period?.(event), key = `${bucket ?? ''}:${event.type}`;
        const row = groups.get(key) ?? { _id: bucket ? { type: event.type, period: bucket } : event.type, count: 0, legacy: 0 };
        row.count++; if (event.provenance === 'LEGACY_STATE') row.legacy++; groups.set(key, row);
      }
      return [...groups.values()];
    };
    const facet = pipeline[1].$facet;
    if (!facet) return { toArray: async () => group(selected) };
    const trunc = facet.periods[0].$group._id.period.$dateToString.date.$dateTrunc;
    assert.equal(trunc.date, '$occurredAt'); assert.equal(trunc.timezone, 'America/Santiago');
    assert.equal(facet.periods[0].$group._id.period.$dateToString.timezone, 'America/Santiago');
    assert.ok(['week', 'month'].includes(trunc.unit));
    if (trunc.unit === 'week') assert.equal(trunc.startOfWeek, 'monday');
    const period = (event: typeof events[number]) => {
      const civil = new Intl.DateTimeFormat('sv-SE', { timeZone: trunc.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(event.occurredAt);
      const date = new Date(`${civil}T00:00:00Z`);
      if (trunc.unit === 'month') date.setUTCDate(1);
      else date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      return date.toISOString().slice(0, 10);
    };
    return { toArray: async () => {
      const result = [{ total: group(selected), periods: group(selected, period) }];
      await afterCalculation?.();
      return result;
    } };
  } }));
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://dashboard-test.invalid');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + token);
    if (url.pathname === '/auth/v1/user') return invalidAuth ? Response.json({ code: 'bad_jwt' }, { status: 401 })
      : Response.json({ id: viewer, email: 'reader@duocuc.cl', email_confirmed_at: '2026-01-01T00:00:00Z' });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json((await db.query('SELECT * FROM perfil_usuario WHERE id=$1', [viewer])).rows);
    const kind = url.pathname.endsWith('/usuario_rol') ? 'rol' : 'permiso';
    assert.equal(url.searchParams.get('revocado_en'), 'is.null');
    return Response.json((await db.query(`SELECT link.campus_id,json_build_object('id',cat.id,'nombre',cat.nombre) AS ${kind}
      FROM usuario_${kind} link JOIN ${kind} cat ON cat.id=link.${kind}_id
      WHERE link.perfil_usuario_id=$1 AND link.revocado_en IS NULL`, [viewer])).rows);
  };
  ({ readDashboardMetrics: readMetrics } = await import('../src/modules/analytics/analytics.repository.js'));
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/analytics/dashboard';
});

beforeEach(async () => {
  sqlFailure = false; mongoFailure = false; invalidAuth = false; mongoReads = 0; metricReads = 0; events = [];
  reportWriteFailure = false; reportCommitFailure = false; afterCalculation = undefined; viewer = reader; statements = [];
  afterSnapshotRead = undefined;
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
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, id === reader ? 'reader@duocuc.cl' : `${id}@duocuc.cl`]);
  await db.query(`INSERT INTO perfil_usuario(id,institucion_id,campus_id,nombre_completo,estado_cuenta,created_at,verificado_en)
    VALUES($1,$2,$3,'Perfil',$4,$5,$5)`, [id, institution, at, state, created]);
  return id;
}
async function grant(name: string, at = campus, kind = 'rol', userId = reader) {
  const catalog = (await db.query<{ id: string }>(`INSERT INTO ${kind}(nombre) VALUES($1)
    ON CONFLICT(nombre) DO UPDATE SET nombre=excluded.nombre RETURNING id`, [name])).rows[0].id;
  await db.query(`INSERT INTO usuario_${kind}(perfil_usuario_id,${kind}_id,campus_id) VALUES($1,$2,$3)`, [userId, catalog, at]);
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

const reportFilters = { from: '2026-10-10', to: '2026-10-10', grouping: 'month' };
const generateReport = (body: unknown = reportFilters, authorization = 'Bearer ' + token, query = '') =>
  originalFetch(base.replace('/dashboard', '/reports') + query, { method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const savedReport = (id: string, query = '', authorization = 'Bearer ' + token) =>
  originalFetch(base.replace('/dashboard', '/reports/') + id + query, { headers: { Authorization: authorization } });
const history = (query = '', authorization = 'Bearer ' + token) =>
  originalFetch(base.replace('/dashboard', '/reports') + (query ? '?' + query : ''), { headers: { Authorization: authorization } });

const exportReport = (id: string, format: string, query = '', authorization = 'Bearer ' + token) =>
  savedReport(`${id}/export/${format}`, query, authorization);

test('PDF and Excel export the saved snapshot without recalculation or writes after operational changes', async () => {
  const resource = await publication(); await view(resource, '2026-10-10T12:00:00Z');
  await grant('ADMINISTRADOR', otherCampus);
  const report = (await (await generateReport({ ...reportFilters, campusIds: `${campus},${otherCampus}` })).json()).data;
  const before = (await db.query('SELECT * FROM reporte WHERE id=$1', [report.id])).rows[0];
  await view(resource, '2026-10-10T15:00:00Z');
  await db.query("UPDATE campus SET nombre='Nombre cambiado',activo=false");
  await db.query("UPDATE perfil_usuario SET nombre_completo='Otro nombre'");
  await db.query("UPDATE auth.users SET email='changed@duocuc.cl' WHERE id=$1", [reader]);
  const reads = { metricReads, mongoReads }; mongoFailure = true; statements = [];
  const excel = await exportReport(report.id, 'xlsx'); assert.equal(excel.status, 200);
  assert.equal(excel.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(excel.headers.get('cache-control'), 'no-store');
  assert.equal(excel.headers.get('content-disposition'), `attachment; filename="CampusLink_Reporte_Mensual_${report.period.from}_${report.period.to}_multi-campus_${report.id.slice(0,8)}.xlsx"`);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
  const meta = new Map<string, unknown>(); workbook.getWorksheet('Reporte')!.eachRow((row, index) => { if (index > 1) meta.set(String(row.getCell(1).value), row.getCell(2).value); });
  assert.equal(meta.get('Reporte ID'), report.id); assert.equal(meta.get('Institución'), report.scope.institutionName);
  assert.equal(meta.get('Campus 1'), report.scope.campuses[0].name); assert.equal(meta.get('Campus 2'), report.scope.campuses[1].name);
  assert.equal(meta.get('Responsable'), report.generatedBy.name); assert.equal(meta.get('Fecha original de generación (ISO)'), report.generatedAt);
  assert.equal(meta.get('Correo del responsable'), 'reader@duocuc.cl');
  assert.equal(meta.get('Desde (inclusivo)'), report.period.from); assert.equal(meta.get('Hasta (inclusivo)'), report.period.to);
  assert.equal(meta.get('Versión de cálculo'), report.calculationVersion);
  assert.equal(workbook.getWorksheet('Indicadores')!.getCell('K2').value, 1); // La vista posterior no se incluye.
  const pdf = await exportReport(report.id, 'pdf'); assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.equal(pdf.headers.get('cache-control'), 'no-store');
  const document = await PDFDocument.load(await pdf.arrayBuffer());
  assert.equal(document.getAuthor(), report.generatedBy.name); assert.equal(document.getCreationDate()?.toISOString(), new Date(report.generatedAt).toISOString().replace(/\.\d{3}Z$/, '.000Z'));
  assert.ok(document.getPageCount() >= 2);
  assert.deepEqual({ metricReads, mongoReads }, reads);
  assert.ok(!statements.some(sql => /\b(INSERT|UPDATE|DELETE)\s+(INTO|public\.reporte|FROM)/i.test(sql)), 'export never writes');
  assert.deepEqual((await db.query('SELECT * FROM reporte WHERE id=$1', [report.id])).rows[0], before);
});

test('exports recheck all saved campuses and current reporting permission regardless of authorship', async () => {
  await grant('ADMINISTRADOR', otherCampus);
  const report = (await (await generateReport({ ...reportFilters, campusIds: `${campus},${otherCampus}` })).json()).data;
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE campus_id=$1', [otherCampus]);
  for (const format of ['pdf', 'xlsx']) assert.equal((await exportReport(report.id, format)).status, 403);
  await db.query('DELETE FROM usuario_rol'); await grant('USUARIO_AUTORIZADO');
  await grant('ACCEDER_REPORTERIA', campus, 'permiso');
  assert.equal((await exportReport(report.id, 'xlsx')).status, 403);
  await grant('USUARIO_AUTORIZADO', otherCampus); await grant('ACCEDER_REPORTERIA', otherCampus, 'permiso');
  assert.equal((await exportReport(report.id, 'xlsx')).status, 200);
  await db.query("UPDATE usuario_permiso SET revocado_en=now()");
  assert.equal((await exportReport(report.id, 'pdf')).status, 403);
});

test('a revocation, account suspension or context change during export prevents delivery', async () => {
  const report = (await (await generateReport()).json()).data;
  for (const change of [
    "UPDATE usuario_rol SET revocado_en=now()",
    "UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA'",
    `UPDATE perfil_usuario SET campus_id='${otherCampus}'`,
  ]) {
    await db.query('UPDATE usuario_rol SET revocado_en=null');
    await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',campus_id=$1", [campus]);
    afterSnapshotRead = async () => { await db.exec(change); };
    const response = await exportReport(report.id, 'xlsx'); assert.equal(response.status, 403, change);
    assert.match(response.headers.get('content-type')!, /application\/json/);
    assert.equal(response.headers.get('content-disposition'), null);
  }
});

test('export validates IDs/formats/query and never exposes other institutions or private failures', async () => {
  const report = (await (await generateReport()).json()).data;
  for (const [id, format, query] of [[report.id, 'csv', ''], ['invalid', 'pdf', ''], [report.id, 'pdf', '?from=2026-10-10'], [report.id, 'xlsx', '?format=pdf']]) {
    assert.equal((await exportReport(id, format, query)).status, 400);
  }
  assert.equal((await exportReport(randomUUID(), 'pdf')).status, 404);
  await db.query('UPDATE reporte SET institucion_id=$1', [foreignInstitution]);
  assert.equal((await exportReport(report.id, 'pdf')).status, 404);
  await db.query('UPDATE reporte SET institucion_id=$1', [institution]);
  assert.equal((await exportReport(report.id, 'pdf', '', '')).status, 401);
  invalidAuth = true; assert.equal((await exportReport(report.id, 'xlsx')).status, 401); invalidAuth = false;
  sqlFailure = true;
  const failed = await exportReport(report.id, 'xlsx'); assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('private'));
  sqlFailure = false;
  await db.query("UPDATE reporte SET snapshot_json=jsonb_set(snapshot_json,'{calculationVersion}','\"unknown-version\"')");
  for (const format of ['pdf', 'xlsx']) {
    const response = await exportReport(report.id, format); assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('Unsupported'));
  }
});

test('history exposes saved metadata, supports scope and overlapping civil periods, and never recalculates', async () => {
  const { career } = await academicFixtures(); await grant('ADMINISTRADOR', otherCampus);
  const first = (await (await generateReport({ from: '2026-09-01', to: '2026-09-30', grouping: 'week', careerId: career })).json()).data;
  const second = (await (await generateReport({ ...reportFilters, campusIds: `${campus},${otherCampus}` })).json()).data;
  const third = (await (await generateReport({ ...reportFilters, campusId: otherCampus })).json()).data;
  const reads = { mongoReads, metricReads }; mongoFailure = true;
  const response = await history(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const page = (await response.json()).data;
  assert.deepEqual(page.items.map((row: any) => row.id), [third.id, second.id, first.id]);
  assert.equal(page.nextCursor, null);
  const { activeUsers, resourceDemand, subjectDemand, activityParticipation, intervals, notes, ...metadata } = second;
  assert.deepEqual(page.items[1], metadata);
  for (const [query, ids] of [
    [`campusIds=${campus}`, [second.id, first.id]],
    [`campusIds=${otherCampus}`, [third.id, second.id]],
    [`campusIds=${campus},${otherCampus}`, [third.id, second.id, first.id]],
    [`careerId=${career}`, [first.id]],
    ['grouping=week', [first.id]],
    ['from=2026-09-30&to=2026-10-01', [first.id]],
    ['from=2026-10-10&to=2026-10-10', [third.id, second.id]],
    ['from=2026-10-11', []], ['to=2026-08-31', []],
    [`institutionId=${institution.toUpperCase()}`, [third.id, second.id, first.id]],
  ] as const) {
    const filtered = await history(query); assert.equal(filtered.status, 200, query);
    assert.deepEqual((await filtered.json()).data.items.map((row: any) => row.id), ids, query);
  }
  assert.deepEqual({ mongoReads, metricReads }, reads);
  assert.deepEqual((await (await savedReport(first.id)).json()).data, first);
  assert.deepEqual((await (await savedReport(second.id)).json()).data, second);
});

test('history authorizes all saved campuses before pagination and hides reports after revocation regardless of authorship', async () => {
  await grant('ADMINISTRADOR', otherCampus);
  const first = (await (await generateReport()).json()).data;
  const mixed = (await (await generateReport({ ...reportFilters, campusIds: `${campus},${otherCampus}` })).json()).data;
  const other = (await (await generateReport({ ...reportFilters, campusId: otherCampus })).json()).data;
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE campus_id=$1', [otherCampus]);
  const response = await history('limit=1'); assert.equal(response.status, 200);
  const page = (await response.json()).data;
  assert.deepEqual(page.items.map((row: any) => row.id), [first.id]); assert.equal(page.nextCursor, null);
  assert.equal((await savedReport(mixed.id)).status, 403); assert.equal((await savedReport(other.id)).status, 403);
  assert.equal((await history(`campusIds=${otherCampus}`)).status, 403);
  await grant('USUARIO_AUTORIZADO', otherCampus); await grant('ACCEDER_ANALITICA', otherCampus, 'permiso');
  assert.equal((await (await history()).json()).data.items.length, 1);
  await grant('ACCEDER_REPORTERIA', otherCampus, 'permiso');
  assert.equal((await (await history()).json()).data.items.length, 3);
  await db.exec('UPDATE usuario_rol SET revocado_en=now()');
  assert.equal((await history()).status, 403);
});

test('history cursor handles tied generation times and new reports without duplicate or skipped rows', async () => {
  const first = (await (await generateReport()).json()).data;
  const second = (await (await generateReport()).json()).data;
  // Simula dos generaciones que compartieron el mismo milisegundo.
  await db.query("UPDATE reporte SET generado_en=$1::text::timestamptz,snapshot_json=jsonb_set(snapshot_json,'{generatedAt}',to_jsonb($1::text)) WHERE id=$2", [first.generatedAt, second.id]);
  const expected = [first.id, second.id].sort().reverse();
  const page = (await (await history('limit=1')).json()).data;
  assert.equal(page.items[0].id, expected[0]); assert.ok(page.nextCursor);
  const newest = (await (await generateReport()).json()).data;
  const next = await history('limit=1&cursor=' + encodeURIComponent(page.nextCursor)); assert.equal(next.status, 200);
  const nextPage = (await next.json()).data;
  assert.equal(nextPage.items[0].id, expected[1]); assert.equal(nextPage.nextCursor, null);
  assert.equal((await (await history('limit=1')).json()).data.items[0].id, newest.id);
});

test('history preserves original metadata after catalog edits and author deactivation, including inactive historical scopes', async () => {
  const { career } = await academicFixtures();
  const original = (await (await generateReport({ ...reportFilters, careerId: career })).json()).data;
  await db.query("UPDATE institucion SET nombre='Renombrada' WHERE id=$1", [institution]);
  await db.query("UPDATE campus SET nombre='Retirado',activo=false WHERE id=$1", [campus]);
  await db.query("UPDATE carrera SET nombre='Retirada',activo=false WHERE id=$1", [career]);
  await db.query("UPDATE perfil_usuario SET nombre_completo='Otro nombre',estado_cuenta='DESACTIVADA',deleted_at=now() WHERE id=$1", [reader]);
  await db.query("UPDATE auth.users SET email='renamed@duocuc.cl' WHERE id=$1", [reader]);
  viewer = await profile(); await grant('ADMINISTRADOR', campus, 'rol', viewer);
  mongoFailure = true;
  const response = await history(`careerId=${career}&campusIds=${campus}`); assert.equal(response.status, 200);
  const item = (await response.json()).data.items[0];
  assert.deepEqual(item.scope, original.scope); assert.deepEqual(item.generatedBy, original.generatedBy);
  assert.deepEqual((await (await savedReport(original.id)).json()).data, original);
});

test('history rejects malformed filters, foreign scopes, invalid sessions and unavailable dependencies without leaking snapshots', async () => {
  for (const query of ['from=2026-02-30', 'from=2026-10-10&to=2026-10-01', 'to=0000-01-01', 'grouping=day', 'grouping=',
    'from=2026-10-01&from=2026-10-02', 'campusIds=invalid', 'campusIds=', 'careerId=invalid', 'institutionId=invalid',
    'campusId=' + campus, 'limit=0', 'limit=51', 'limit=1.5', 'limit=01', 'cursor=invalid', 'generatedBy=' + reader]) {
    assert.equal((await history(query)).status, 400, query);
  }
  assert.equal((await history(`institutionId=${foreignInstitution}`)).status, 403);
  assert.equal((await history(`campusIds=${foreignCampus}`)).status, 403);
  const { data: original } = await (await generateReport()).json();
  await db.query('UPDATE reporte SET institucion_id=$1 WHERE id=$2', [foreignInstitution, original.id]);
  assert.deepEqual((await (await history()).json()).data, { items: [], nextCursor: null });
  assert.equal((await history('', '')).status, 401);
  invalidAuth = true; assert.equal((await history()).status, 401); invalidAuth = false;
  for (const state of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$1 WHERE id=$2', [state, reader]);
    assert.equal((await history()).status, 403);
  }
  await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA' WHERE id=$1", [reader]);
  sqlFailure = true; const failed = await history(); assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private|credentials|generatedBy|activeUsers|snapshot_json/);
  assert.equal(mongoReads, 1); // Solo la generación inicial, jamás el historial.
});

test('generated report reuses all dashboard results and carries server-owned attribution and calculation version', async () => {
  const { career } = await academicFixtures(); await grant('ADMINISTRADOR', otherCampus);
  await db.query('INSERT INTO usuario_carrera(perfil_usuario_id,carrera_id) VALUES($1,$2)', [reader, career]);
  const resource = await publication();
  await db.query('INSERT INTO publicacion_carrera VALUES($1,$2)', [resource, career]);
  const subject = randomUUID();
  await db.query("INSERT INTO asignatura(id,nombre,codigo) VALUES($1,'Álgebra','ALG')", [subject]);
  await db.query('INSERT INTO publicacion_asignatura VALUES($1,$2)', [resource, subject]);
  await view(resource, '2026-10-10T12:00:00Z'); await requestResource(resource, '2026-10-10T12:00:00Z');
  events = [{ campusId: campus, userId: reader, occurredAt: new Date('2026-10-10T12:00:00Z'), type: 'JOINED' }];
  for (const grouping of ['week', 'month']) {
    const filters = { from: '2026-09-01', to: '2026-10-10', grouping, institutionId: institution,
      campusIds: [campus, otherCampus].join(','), careerId: career };
    const dashboard = (await (await request(new URLSearchParams(filters).toString())).json()).data;
    const before = Date.now(), response = await generateReport(filters), after = Date.now();
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const { data } = await response.json();
    assert.deepEqual(data.generatedBy, { userId: reader, name: 'Perfil', email: 'reader@duocuc.cl' });
    assert.equal(data.calculationVersion, 'campuslink-kpi-v1');
    assert.ok(Date.parse(data.generatedAt) >= before && Date.parse(data.generatedAt) <= after);
    const { id, generatedBy, calculationVersion, generatedAt, ...reportData } = data;
    const { generatedAt: dashboardTime, ...dashboardData } = dashboard;
    assert.deepEqual(reportData, dashboardData);
    assert.equal(data.resourceDemand.views, 1); assert.equal(data.resourceDemand.requests, 1);
    assert.equal(data.subjectDemand.subjects[0].subjectName, 'Álgebra'); assert.equal(data.activityParticipation.value, 1);
    assert.equal(data.scope.campusId, null); assert.equal(data.scope.career.id, career);
    const stored = (await db.query<any>('SELECT * FROM reporte WHERE id=$1', [id])).rows[0];
    assert.deepEqual(stored.snapshot_json, data);
    assert.deepEqual(stored.filtros_json, { ...filters, campusIds: [campus, otherCampus].sort() });
    assert.equal(stored.generado_por_id, reader); assert.equal(stored.institucion_id, institution);
    assert.equal(stored.campus_id, null); assert.equal(stored.carrera_id, career);
    assert.equal(stored.agrupacion, grouping === 'week' ? 'SEMANA' : 'MES');
    assert.equal(new Date(stored.generado_en).toISOString(), data.generatedAt);
  }
});

test('report generation validates its entire body before reading metrics and rejects spoofed metadata or results', async () => {
  for (const body of [null, [], 'filters', {}, { ...reportFilters, from: '2026-02-30' },
    { ...reportFilters, to: '2026-10-09' }, { ...reportFilters, grouping: ['week'] },
    { ...reportFilters, grouping: 'day' }, { ...reportFilters, from: '2000-01-01', grouping: 'week' },
    { ...reportFilters, campusIds: [campus] }, { ...reportFilters, campusIds: '' },
    { ...reportFilters, campusId: campus, campusIds: campus }, { ...reportFilters, careerId: 'invalid' },
    { ...reportFilters, id: randomUUID() }, { ...reportFilters, filtros_json: {} }, { ...reportFilters, snapshot_json: {} },
    ...['generatedAt', 'generatedBy', 'calculationVersion', 'activeUsers', 'intervals'].map(key => ({ ...reportFilters, [key]: 'spoofed' }))]) {
    assert.equal((await generateReport(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await generateReport(reportFilters, undefined, '?from=2026-01-01')).status, 400);
  assert.equal(metricReads, 0); assert.equal(mongoReads, 0);
});

test('generation checks fresh reporting grants and account status even after a successful dashboard read', async () => {
  await db.exec('DELETE FROM usuario_rol'); await grant('USUARIO_AUTORIZADO');
  await grant('ACCEDER_REPORTERIA', campus, 'permiso');
  assert.equal((await request()).status, 200); assert.equal((await generateReport()).status, 200);
  await db.exec('UPDATE usuario_permiso SET revocado_en=now()');
  const reads = mongoReads; assert.equal((await generateReport()).status, 403); assert.equal(mongoReads, reads);
  await grant('ACCEDER_ANALITICA', campus, 'permiso'); assert.equal((await generateReport()).status, 403);
  await grant('ADMINISTRADOR');
  for (const state of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$1 WHERE id=$2', [state, reader]);
    assert.equal((await generateReport()).status, 403);
  }
  assert.equal((await generateReport(undefined, '')).status, 401);
  invalidAuth = true; assert.equal((await generateReport()).status, 401);
});

test('report generation rejects mixed unauthorized campuses, other institutions and unrelated careers before Mongo', async () => {
  const { foreignCareer, unavailableCareer } = await academicFixtures();
  for (const filters of [{ campusIds: [campus, otherCampus].join(',') }, { institutionId: foreignInstitution },
    { careerId: foreignCareer }, { careerId: unavailableCareer }]) {
    assert.equal((await generateReport({ ...reportFilters, ...filters })).status, 403);
  }
  await grant('ADMINISTRADOR', foreignCampus);
  assert.equal((await generateReport({ ...reportFilters, campusIds: [campus, foreignCampus].join(',') })).status, 403);
  await db.query('UPDATE campus SET activo=false WHERE id=$1', [campus]);
  assert.equal((await generateReport()).status, 403); assert.equal(mongoReads, 0);
});

test('report generation preserves observed zeroes, future unavailability and dependency failures', async () => {
  const observed = (await (await generateReport()).json()).data;
  assert.equal(observed.resourceDemand.value, 0); assert.equal(observed.intervals[0].status, 'no_activity');
  const future = (await (await generateReport({ from: '9999-01-01', to: '9999-01-31', grouping: 'week' })).json()).data;
  assert.equal(future.resourceDemand.value, null); assert.ok(future.intervals.every((row: any) => row.metrics === null));
  for (const dependency of ['SQL', 'MongoDB']) {
    sqlFailure = dependency === 'SQL'; mongoFailure = dependency === 'MongoDB';
    const response = await generateReport(); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|credentials|generatedBy|activeUsers/);
  }
});

test('snapshot stores normalized defaults and exact Santiago calendar bounds across DST', async () => {
  const response = await generateReport({ from: '2026-09-06', to: '2026-09-06', campusIds: `${campus.toUpperCase()},${campus}` });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.match(data.id, /^[0-9a-f-]{36}$/);
  const stored = (await db.query<any>('SELECT * FROM reporte WHERE id=$1', [data.id])).rows[0];
  assert.deepEqual(stored.filtros_json, { from: '2026-09-06', to: '2026-09-06', grouping: 'month',
    institutionId: institution, campusIds: [campus], careerId: null });
  assert.equal(stored.campus_id, campus); assert.equal(stored.carrera_id, null);
  assert.equal(new Date(stored.periodo_desde).toISOString(), '2026-09-06T04:00:00.000Z');
  assert.equal(new Date(stored.periodo_hasta).toISOString(), '2026-09-07T03:00:00.000Z');
  assert.deepEqual(stored.snapshot_json, data);
  const future = (await (await generateReport({ from: '9999-01-01', to: '9999-01-31' })).json()).data;
  assert.ok(future.intervals.every((row: any) => row.metrics === null));
  assert.deepEqual((await (await savedReport(future.id)).json()).data, future);
});

test('saved snapshot survives academic edits, new facts and author deletion without operational queries', async () => {
  const { career } = await academicFixtures();
  await db.query('INSERT INTO usuario_carrera(perfil_usuario_id,carrera_id) VALUES($1,$2)', [reader, career]);
  const resource = await publication(), subject = randomUUID();
  await db.query('INSERT INTO publicacion_carrera VALUES($1,$2)', [resource, career]);
  await db.query("INSERT INTO asignatura(id,nombre,codigo) VALUES($1,'Original','ORIG')", [subject]);
  await db.query('INSERT INTO publicacion_asignatura VALUES($1,$2)', [resource, subject]);
  await view(resource, '2026-10-10T12:00:00Z');
  events = [{ campusId: campus, userId: reader, occurredAt: new Date('2026-10-10T12:00:00Z'), type: 'JOINED' }];
  const { data: original } = await (await generateReport({ ...reportFilters, careerId: career })).json();
  const originalRow = (await db.query('SELECT * FROM reporte WHERE id=$1', [original.id])).rows[0];
  await db.query("UPDATE institucion SET nombre='Institución editada' WHERE id=$1", [institution]);
  await db.query("UPDATE campus SET nombre='Campus editado' WHERE id=$1", [campus]);
  await db.query("UPDATE carrera SET nombre='Carrera editada',activo=false WHERE id=$1", [career]);
  await db.query("UPDATE asignatura SET nombre='Asignatura editada' WHERE id=$1", [subject]);
  await db.query('DELETE FROM usuario_carrera WHERE perfil_usuario_id=$1', [reader]);
  await db.query('DELETE FROM publicacion_carrera WHERE publicacion_id=$1', [resource]);
  await db.query('DELETE FROM publicacion_asignatura WHERE publicacion_id=$1', [resource]);
  await db.query("UPDATE perfil_usuario SET nombre_completo='Autor editado',deleted_at=now(),estado_cuenta='DESACTIVADA' WHERE id=$1", [reader]);
  await db.query("UPDATE publicacion_recurso SET titulo='Editado',deleted_at=now() WHERE id=$1", [resource]);
  await view(resource, '2026-10-10T13:00:00Z'); events = [];
  viewer = await profile(); await grant('ADMINISTRADOR', campus, 'rol', viewer);
  const reads = { mongoReads, metricReads }; statements = []; mongoFailure = true;
  for (let i = 0; i < 2; i++) {
    const response = await savedReport(original.id);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).data, original);
  }
  assert.deepEqual({ mongoReads, metricReads }, reads);
  assert.ok(statements.every(sql => !/INSERT|UPDATE|DELETE|publicacion|asignatura|carrera|perfil_usuario/i.test(sql)));
  assert.deepEqual((await db.query('SELECT * FROM reporte WHERE id=$1', [original.id])).rows[0], originalRow);
  mongoFailure = false;
  const { data: updated } = await (await generateReport({ ...reportFilters, careerId: career })).json();
  assert.notEqual(updated.id, original.id); assert.ok(updated.generatedAt > original.generatedAt);
  assert.equal(updated.resourceDemand.value, 0); assert.equal(updated.activityParticipation.value, 0);
  assert.equal(updated.generatedBy.userId, viewer);
  assert.deepEqual((await (await savedReport(original.id)).json()).data, original);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte')).rows[0].count, 2);
});

test('snapshot lookup checks every stored campus and current permission rather than authorship', async () => {
  await grant('ADMINISTRADOR', otherCampus);
  const { data } = await (await generateReport({ ...reportFilters, campusIds: `${campus},${otherCampus}` })).json();
  await db.query('UPDATE usuario_rol SET revocado_en=now() WHERE campus_id=$1', [otherCampus]);
  assert.equal((await savedReport(data.id)).status, 403);
  await grant('USUARIO_AUTORIZADO', otherCampus); await grant('ACCEDER_ANALITICA', otherCampus, 'permiso');
  assert.equal((await savedReport(data.id)).status, 403);
  await grant('ACCEDER_REPORTERIA', otherCampus, 'permiso');
  assert.equal((await savedReport(data.id)).status, 200);
  await db.query('UPDATE usuario_permiso SET revocado_en=now() WHERE campus_id=$1', [otherCampus]);
  assert.equal((await savedReport(data.id)).status, 403);
  for (const state of ['SUSPENDIDA', 'DESACTIVADA']) {
    await db.query('UPDATE perfil_usuario SET estado_cuenta=$1 WHERE id=$2', [state, reader]);
    assert.equal((await savedReport(data.id)).status, 403);
  }
  assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte')).rows[0].count, 1);
});

test('snapshot lookup rejects invalid IDs, filters, foreign institutions, missing records and unauthenticated access', async () => {
  const { data } = await (await generateReport()).json();
  assert.equal((await savedReport('invalid')).status, 400);
  assert.equal((await savedReport(data.id, '?campusId=' + campus)).status, 400);
  assert.equal((await savedReport(randomUUID())).status, 404);
  assert.equal((await savedReport(data.id, '', '')).status, 401);
  invalidAuth = true; assert.equal((await savedReport(data.id)).status, 401); invalidAuth = false;
  await db.query('UPDATE perfil_usuario SET institucion_id=$1,campus_id=$2 WHERE id=$3', [foreignInstitution, foreignCampus, reader]);
  await grant('ADMINISTRADOR', foreignCampus);
  const foreign = await savedReport(data.id); assert.equal(foreign.status, 404);
  assert.doesNotMatch(await foreign.text(), /generatedBy|activeUsers|snapshot_json/);
  sqlFailure = true;
  const unavailable = await savedReport(data.id); assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private|credentials|generatedBy|activeUsers/);
});

test('failed report insert or commit returns no snapshot and rolls back without altering previous reports', async () => {
  const { data: original } = await (await generateReport()).json();
  for (const failure of ['insert', 'commit', 'mongo']) {
    statements = []; reportWriteFailure = failure === 'insert'; reportCommitFailure = failure === 'commit'; mongoFailure = failure === 'mongo';
    const response = await generateReport(); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|details|generatedBy|activeUsers/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte')).rows[0].count, 1);
  }
  reportWriteFailure = false; reportCommitFailure = false; mongoFailure = false;
  assert.deepEqual((await (await savedReport(original.id)).json()).data, original);
});

test('saving rechecks role, reporting permission, account state and campus changes after calculation', async () => {
  for (const change of ['role', 'permission', 'state', 'campus']) {
    await db.query('DELETE FROM usuario_rol'); await db.query('DELETE FROM usuario_permiso');
    await db.query("UPDATE perfil_usuario SET estado_cuenta='ACTIVA',campus_id=$1 WHERE id=$2", [campus, reader]);
    await grant('USUARIO_AUTORIZADO'); await grant('ACCEDER_REPORTERIA', campus, 'permiso');
    afterCalculation = async () => {
      if (change === 'role') await db.query('UPDATE usuario_rol SET revocado_en=now()');
      if (change === 'permission') await db.query('UPDATE usuario_permiso SET revocado_en=now()');
      if (change === 'state') await db.query("UPDATE perfil_usuario SET estado_cuenta='SUSPENDIDA' WHERE id=$1", [reader]);
      if (change === 'campus') await db.query('UPDATE perfil_usuario SET campus_id=$1 WHERE id=$2', [otherCampus, reader]);
    };
    const response = await generateReport(); assert.equal(response.status, change === 'campus' ? 409 : 403);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM reporte')).rows[0].count, 0);
  }
});

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
    { campusId: campus, occurredAt: localStart, type: 'JOINED' },
    { campusId: campus, occurredAt: new Date('2026-10-10T12:00:00Z'), type: 'LEFT' },
    { campusId: campus, occurredAt: new Date('2026-10-10T13:00:00Z'), type: 'JOINED', provenance: 'LEGACY_STATE' },
    { campusId: campus, occurredAt: localStart, type: 'VIEWED' },
    { campusId: otherCampus, occurredAt: localStart, type: 'JOINED' },
    { campusId: campus, occurredAt: localUntil, type: 'JOINED' },
  ];
  const response = await request(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const { data } = await response.json();
  assert.deepEqual(data.period, { from: '2026-10-10', to: '2026-10-10', timeZone: 'America/Santiago', cutoff: localUntil.toISOString() });
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
    { campusId: campus, userId: member, occurredAt: localStart, type: 'JOINED' },
    { campusId: campus, userId: member, occurredAt: localStart, type: 'LEFT' },
    { campusId: otherCampus, userId: otherMember, occurredAt: localStart, type: 'JOINED', provenance: 'LEGACY_STATE' },
    { campusId: campus, userId: reader, occurredAt: localStart, type: 'JOINED' },
    { campusId: foreignCampus, userId: member, occurredAt: localStart, type: 'JOINED' },
    { campusId: campus, userId: member, occurredAt: localUntil, type: 'JOINED' },
  ];
  const filters = `from=2026-10-10&to=2026-10-10&institutionId=${institution}&campusIds=${campus},${otherCampus},${campus}`;
  const response = await request(filters + '&careerId=' + career); assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.activeUsers.value, 2); assert.deepEqual([data.resourceDemand.views, data.resourceDemand.requests], [2, 1]);
  assert.deepEqual(data.subjectDemand.subjects.map((s: any) => [s.subjectId, s.views, s.requests]), [[shared, 2, 1], [unrelated, 1, 1]]);
  assert.equal(data.activityParticipation.value, 2); assert.equal(data.activityParticipation.legacyEvents, 1);
  assert.equal(data.scope.campusId, null); assert.equal(data.scope.campuses.length, 2); assert.equal(data.scope.career.id, career);
  assert.equal(data.intervals[0].metrics.activeUsers.value, data.activeUsers.value);
  assert.deepEqual(data.intervals[0].metrics.resourceDemand, data.resourceDemand);
  assert.deepEqual(data.intervals[0].metrics.subjectDemand, data.subjectDemand);
  assert.deepEqual(data.intervals[0].metrics.activityParticipation, data.activityParticipation);
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

test('weekly series clips ISO weeks across years and preserves identical SQL/Mongo boundaries and per-cutoff account state', async () => {
  const id = await publication(), subject = randomUUID();
  await db.query("INSERT INTO asignatura(id,codigo,nombre) VALUES($1,'WEEK','Semanal')", [subject]);
  await db.query('INSERT INTO publicacion_asignatura VALUES($1,$2)', [id, subject]);
  const suspended = await profile(undefined, 'SUSPENDIDA', '2025-01-01');
  await change(suspended, 'ACTIVA', 'SUSPENDIDA', '2026-01-05T03:00:00Z');
  for (const when of ['2025-12-31T03:00:00Z', '2026-01-05T02:59:59.999999Z', '2026-01-05T03:00:00Z',
    '2026-01-12T02:59:59.999999Z', '2026-01-12T03:00:00Z', '2026-01-14T02:59:59.999999Z', '2026-01-14T03:00:00Z']) {
    await view(id, when); await requestResource(id, when);
    // BSON Date tiene precisión de milisegundos; PostgreSQL conserva microsegundos.
    events.push({ campusId: campus, occurredAt: new Date(when), type: 'JOINED' });
  }
  events.push({ campusId: campus, occurredAt: new Date('2026-01-05T03:00:00Z'), type: 'LEFT' });
  events.push({ campusId: otherCampus, occurredAt: new Date('2026-01-05T03:00:00Z'), type: 'JOINED' });
  const response = await request('from=2025-12-31&to=2026-01-13&grouping=week');
  assert.equal(response.status, 200); const { data } = await response.json();
  assert.equal(data.grouping, 'week'); assert.equal(mongoReads, 1);
  assert.deepEqual(data.intervals.map((row: any) => [row.key, row.period.from, row.period.to, row.period.cutoff]), [
    ['2025-12-29','2025-12-31','2026-01-04','2026-01-05T03:00:00.000Z'],
    ['2026-01-05','2026-01-05','2026-01-11','2026-01-12T03:00:00.000Z'],
    ['2026-01-12','2026-01-12','2026-01-13','2026-01-14T03:00:00.000Z'],
  ]);
  assert.deepEqual(data.intervals.map((row: any) => row.metrics.activeUsers.value), [2, 1, 1]);
  for (const row of data.intervals) {
    assert.equal(row.status, 'recorded'); assert.equal(row.coverage, 'partial');
    assert.equal(row.metrics.resourceDemand.views, 2); assert.equal(row.metrics.resourceDemand.requests, 2);
    assert.equal(row.metrics.subjectDemand.subjects[0].views, 2); assert.equal(row.metrics.subjectDemand.subjects[0].requests, 2);
    assert.equal(row.metrics.activityParticipation.value, 2);
    for (const key of ['activeUsers', 'resourceDemand', 'subjectDemand', 'activityParticipation']) {
      assert.deepEqual(row.metrics[key].period, row.period); assert.deepEqual(row.metrics[key].scope, data.scope);
    }
  }
  assert.equal(data.activeUsers.value, 1); // Saldo final, no suma de saldos semanales.
  assert.equal(data.resourceDemand.views, 6); assert.equal(data.activityParticipation.value, 6);
  const adjacent = (await (await request('from=2026-01-14&to=2026-01-14&grouping=week')).json()).data;
  assert.equal(adjacent.resourceDemand.views, 1); assert.equal(adjacent.activityParticipation.value, 1);
});

test('monthly series includes empty leap-year intervals and clips the first/last month without losing microseconds', async () => {
  const id = await publication();
  await view(id, '2024-02-29T02:59:59.999999Z'); await view(id, '2024-03-01T02:59:59.999999Z');
  await view(id, '2024-03-01T03:00:00Z'); await view(id, '2024-05-03T03:59:59.999999Z');
  await view(id, '2024-05-03T04:00:00Z');
  events = [
    { campusId: campus, occurredAt: new Date('2024-03-01T02:59:59.999Z'), type: 'JOINED', provenance: 'LEGACY_STATE' },
    { campusId: campus, occurredAt: new Date('2024-03-01T03:00:00Z'), type: 'JOINED' },
  ];
  const response = await request('from=2024-02-29&to=2024-05-02&grouping=month');
  assert.equal(response.status, 200); const { data } = await response.json();
  assert.deepEqual(data.intervals.map((row: any) => [row.key, row.period.from, row.period.to, row.metrics.resourceDemand.views]), [
    ['2024-02-01','2024-02-29','2024-02-29',1], ['2024-03-01','2024-03-01','2024-03-31',1],
    ['2024-04-01','2024-04-01','2024-04-30',0], ['2024-05-01','2024-05-01','2024-05-02',1],
  ]);
  assert.equal(data.intervals[0].metrics.activityParticipation.legacyEvents, 1);
  const empty = data.intervals[2];
  assert.equal(empty.status, 'no_activity'); assert.equal(empty.coverage, 'partial');
  assert.equal(empty.metrics.activeUsers.value, 0); assert.equal(empty.metrics.resourceDemand.value, 0);
  assert.equal(empty.metrics.subjectDemand.value, 0); assert.equal(empty.metrics.activityParticipation.value, 0);
  assert.equal(data.resourceDemand.views, 3); assert.equal(mongoReads, 1);
});

test('future intervals are unavailable rather than observed zeroes; current intervals stop at one generation instant', async () => {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const nextMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const response = await request(`from=${today}&to=${nextMonth.toISOString().slice(0, 10)}&grouping=month`);
  assert.equal(response.status, 200); const { data } = await response.json();
  assert.equal(data.period.cutoff, data.generatedAt);
  assert.equal(data.intervals[0].period.cutoff, data.generatedAt);
  assert.ok(data.intervals[0].metrics); assert.equal(data.intervals[0].status, 'no_activity');
  assert.equal(data.intervals[1].status, 'unavailable'); assert.equal(data.intervals[1].coverage, 'unavailable');
  assert.equal(data.intervals[1].metrics, null);
  const future = (await (await request('from=9999-12-30&to=9999-12-31&grouping=week')).json()).data;
  assert.equal(future.activeUsers.value, null); assert.equal(future.resourceDemand.value, null);
  assert.equal(future.subjectDemand.value, null); assert.equal(future.activityParticipation.value, null);
  assert.equal(future.intervals[0].metrics, null);
});

test('grouping and interval count are validated before metrics; SQL session timezone cannot change institutional buckets', async () => {
  for (const suffix of ['&grouping=day', '&grouping=', '&grouping=month&grouping=week', '&grouping[x]=week']) {
    assert.equal((await request('from=2026-10-01&to=2026-10-10' + suffix)).status, 400, suffix);
  }
  assert.equal((await request('from=0001-01-01&to=9999-12-31&grouping=week')).status, 400);
  assert.equal(mongoReads, 0);
  const id = await publication(); await view(id, '2026-03-01T03:00:00Z');
  await db.exec("SET TIME ZONE 'Asia/Tokyo'");
  try {
    const response = await request('from=2026-02-28&to=2026-03-01&grouping=month');
    assert.equal(response.status, 200); const { data } = await response.json();
    assert.deepEqual(data.intervals.map((row: any) => row.metrics.resourceDemand.views), [0, 1]);
    assert.equal(data.period.timeZone, 'America/Santiago');
  } finally { await db.exec("SET TIME ZONE 'UTC'"); }
});

test('Santiago DST days contain 23 or 25 hours with identical half-open event bounds in SQL and Mongo', async () => {
  const { dashboardIntervals } = await import('../src/modules/analytics/analytics.periods.js');
  const id = await publication();
  for (const [date, from, until, hours] of [
    ['2026-09-06','2026-09-06T04:00:00.000Z','2026-09-07T03:00:00.000Z',23],
    ['2026-04-04','2026-04-04T03:00:00.000Z','2026-04-05T04:00:00.000Z',25],
  ] as const) {
    const [window] = dashboardIntervals(date, date, 'week');
    assert.equal(window.from.toISOString(), from); assert.equal(window.until.toISOString(), until);
    assert.equal((window.until.getTime() - window.from.getTime()) / 3_600_000, hours);
    const before = (instant: string) => new Date(new Date(instant).getTime() - 1000).toISOString().replace('.000Z', '.999999Z');
    events = [];
    for (const when of [before(from), from, before(until), until]) {
      await view(id, when); await requestResource(id, when);
      events.push({ campusId: campus, occurredAt: new Date(when), type: 'JOINED' });
    }
    for (const grouping of ['week', 'month']) {
      const response = await request(`from=${date}&to=${date}&grouping=${grouping}`);
      assert.equal(response.status, 200); const { data } = await response.json();
      assert.equal(data.period.cutoff, until); assert.equal(data.intervals[0].period.cutoff, until);
      assert.equal(data.intervals[0].metrics.resourceDemand.views, 2);
      assert.equal(data.intervals[0].metrics.resourceDemand.requests, 2);
      assert.equal(data.intervals[0].metrics.activityParticipation.value, 2);
    }
  }
});

test('long ranges use two batched SQL metric queries and one Mongo aggregation, with no per-interval reads', async () => {
  const response = await request('from=2023-01-01&to=2025-12-31&grouping=week');
  assert.equal(response.status, 200); const { data } = await response.json();
  assert.ok(data.intervals.length > 150); assert.equal(metricReads, 2); assert.equal(mongoReads, 1);
  assert.ok(data.intervals.every((row: any) => row.metrics !== null && row.status === 'no_activity'));
});
