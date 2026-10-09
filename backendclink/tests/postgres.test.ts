import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { Pool } from 'pg';

let withTransaction: typeof import('../src/database/supabase/postgres.js').withPostgresTransaction;
let closePostgres: () => Promise<void>;
let loadEnv: typeof import('../src/config/env.js').loadEnv;
let statements: string[], released: boolean[], rollbackFails: boolean, connectFails: boolean;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://postgres-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@postgres-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => {
    if (connectFails) throw new Error('private connection details');
    return { query: async (sql: string) => {
      statements.push(sql);
      if (sql === 'ROLLBACK' && rollbackFails) throw new Error('rollback failed');
      return { rows: [] };
    }, release: (destroy: boolean) => released.push(destroy) };
  });
  const driver = await import('../src/database/supabase/postgres.js');
  withTransaction = driver.withPostgresTransaction; closePostgres = driver.closePostgres;
  ({ loadEnv } = await import('../src/config/env.js'));
});
beforeEach(() => { statements = []; released = []; rollbackFails = false; connectFails = false; });
after(async () => { await closePostgres(); mock.restoreAll(); });

test('transaction uses one leased client, commits and releases it', async () => {
  assert.equal(await withTransaction(async client => { await client.query('SELECT 1'); return 'saved'; }), 'saved');
  assert.equal(statements[0], 'BEGIN'); assert.ok(statements[1].includes('statement_timeout'));
  assert.deepEqual(statements.slice(2), ['SELECT 1', 'COMMIT']); assert.deepEqual(released, [false]);
});
test('operation failure rolls back and releases; failed rollback destroys the connection', async () => {
  const failure = new Error('operation failed');
  for (const shouldFail of [false, true]) {
    statements = []; released = []; rollbackFails = shouldFail;
    await assert.rejects(withTransaction(async () => { throw failure; }), error => error === failure);
    assert.equal(statements.at(-1), 'ROLLBACK'); assert.ok(!statements.includes('COMMIT'));
    assert.deepEqual(released, [shouldFail]);
  }
});
test('connection acquisition failure never starts business work', async () => {
  connectFails = true; let ran = false;
  await assert.rejects(withTransaction(async () => { ran = true; }), /connection details/);
  assert.equal(ran, false); assert.deepEqual(statements, []); assert.deepEqual(released, []);
});
test('database URL is optional for other flows, validates protocol/TLS and never exposes credentials', () => {
  assert.equal(loadEnv({ ...process.env, SUPABASE_DB_URL: '' }).supabaseDatabaseUrl, undefined);
  const valid = 'postgresql://postgres:simulated@postgres-test.invalid/postgres?sslmode=verify-full';
  assert.equal(loadEnv({ ...process.env, SUPABASE_DB_URL: valid }).supabaseDatabaseUrl, valid);
  for (const url of ['https://postgres:private-password@example.test', valid.replace('verify-full', 'disable'), valid.replace('sslmode=verify-full', 'ssl=false')]) {
    assert.throws(() => loadEnv({ ...process.env, SUPABASE_DB_URL: url }), error => error instanceof Error && error.message.includes('SUPABASE_DB_URL') && !error.message.includes('private-password'));
  }
});
