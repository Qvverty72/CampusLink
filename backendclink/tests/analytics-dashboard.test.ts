import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';

Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
  SUPABASE_URL: 'https://analytics-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' });

test('dashboard SQL applies campus, interval, account cutoff and per-subject demand', async () => {
  const { readDashboardMetricsFromClient } = await import('../src/modules/analytics/analytics.repository.js');
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE institucion(id uuid PRIMARY KEY,nombre text);
      CREATE TABLE campus(id uuid PRIMARY KEY,institucion_id uuid,nombre text,activo boolean);
      CREATE TABLE asignatura(id uuid PRIMARY KEY,nombre text);
      CREATE TABLE evento_analitica(id uuid PRIMARY KEY,event_type text,occurred_at timestamptz,
        institution_id uuid,campus_id uuid,account_user_id uuid,subject_ids uuid[]);`);
    const institution = randomUUID(), campus = randomUUID(), other = randomUUID();
    const accountA = randomUUID(), accountB = randomUUID(), subjectA = randomUUID(), subjectB = randomUUID();
    await db.query('INSERT INTO institucion VALUES($1,$2)', [institution, 'Institución']);
    await db.query('INSERT INTO campus VALUES($1,$3,$4,true),($2,$3,$5,true)', [campus, other, institution, 'Principal', 'Otra']);
    await db.query('INSERT INTO asignatura VALUES($1,$3),($2,$4)', [subjectA, subjectB, 'Matemática', 'Física']);
    const event = (type: string, time: string, scope: string, account: string | null, subjects: string[]) =>
      db.query(`INSERT INTO evento_analitica VALUES($1,$2,$3,$4,$5,$6,$7::uuid[])`,
        [randomUUID(), type, time, institution, scope, account, subjects]);
    await event('ACCOUNT_ACTIVA', '2026-09-01T00:00:00Z', campus, accountA, []);
    await event('ACCOUNT_ACTIVA', '2026-09-01T00:00:00Z', campus, accountB, []);
    await event('ACCOUNT_SUSPENDIDA', '2026-10-10T00:00:00Z', campus, accountB, []);
    await event('ACCOUNT_ACTIVA', '2026-10-12T00:00:00Z', campus, accountB, []);
    await event('RESOURCE_VIEWED', '2026-10-10T10:00:00Z', campus, null, [subjectA, subjectB]);
    await event('RESOURCE_REQUESTED', '2026-10-10T11:00:00Z', campus, null, [subjectA]);
    await event('RESOURCE_VIEWED', '2026-10-11T00:00:00Z', campus, null, [subjectA]);
    await event('RESOURCE_VIEWED', '2026-10-10T12:00:00Z', other, null, [subjectA]);
    const client = { query: (sql: string, values?: unknown[]) => db.query(sql, values) } as unknown as PoolClient;
    const result = await readDashboardMetricsFromClient(client, campus, institution,
      new Date('2026-10-10T00:00:00Z'), new Date('2026-10-11T00:00:00Z'));
    assert.equal(result.activeUsers, 1);
    assert.deepEqual(result.resourceDemand, { views: 1, requests: 1 });
    assert.deepEqual(result.subjectDemand.map(row => [row.subjectName, row.views, row.requests]),
      [['Física', 1, 0], ['Matemática', 1, 1]]);
    assert.equal(result.scope?.campusName, 'Principal');
    assert.equal((await readDashboardMetricsFromClient(client, campus, randomUUID(),
      new Date('2026-10-10T00:00:00Z'), new Date('2026-10-11T00:00:00Z'))).scope, null);
  } finally { await db.close(); }
});

test('dashboard validates dates and denies a campus without reporting capability', async () => {
  const { getDashboard, parseDashboardQuery } = await import('../src/modules/analytics/analytics.dashboard.js');
  const campus = randomUUID();
  assert.throws(() => parseDashboardQuery({ from: '2026-02-30', to: '2026-03-01' }, campus));
  assert.throws(() => parseDashboardQuery({ from: '2026-10-11', to: '2026-10-10' }, campus));
  const auth = { userId: randomUUID(), campusId: campus,
    profile: { id: '', campus_id: campus, institucion_id: randomUUID(), estado_cuenta: 'ACTIVA', deleted_at: null },
    roles: [], permissions: [] };
  auth.profile.id = auth.userId;
  await assert.rejects(getDashboard(auth as Parameters<typeof getDashboard>[0],
    { from: '2026-10-10', to: '2026-10-10' }), { status: 403 });
});
