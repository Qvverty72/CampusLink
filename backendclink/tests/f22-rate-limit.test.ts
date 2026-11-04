import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createClient } from 'redis';
import { MemoryRateLimitStore, consumeRateLimit } from '../src/shared/rate-limit/rate-limit.js';

const network = globalThis.fetch;
const campus = '22222222-2222-4222-8222-222222222222';
let userId = '11111111-1111-4111-8111-111111111111';
before(() => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://rate-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    RATE_LIMIT_AUTH_MAX: '2', RATE_LIMIT_READ_MAX: '3', RATE_LIMIT_WRITE_MAX: '2', RATE_LIMIT_WINDOW_SECONDS: '2',
    RATE_LIMIT_ORIGIN_MAX: '1000' });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'qa@duocuc.cl', email_confirmed_at: '2026-10-30T12:00:00Z' });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([{ id: userId, campus_id: campus, institucion_id: campus,
      nombre_completo: 'QA', foto_path: null, verificado_en: '2026-10-30T12:00:00Z', estado_cuenta: 'ACTIVA', deleted_at: null }]);
    return Response.json([]);
  };
});
after(() => { globalThis.fetch = network; });

test('[F2.2-09] a fixed window expires on time and does not renew on every rejected request', async () => {
  let time = 1000; const store = new MemoryRateLimitStore(() => time);
  await consumeRateLimit(store, 'user:a', 'read', 1, 2);
  time = 2000;
  await assert.rejects(consumeRateLimit(store, 'user:a', 'read', 1, 2), { status: 429, retryAfterSeconds: 1 });
  time = 3000; await consumeRateLimit(store, 'user:a', 'read', 1, 2);
  await consumeRateLimit(store, 'user:a', 'write', 1, 2);
  await consumeRateLimit(store, 'user:b', 'read', 1, 2);
});

test('[F2.2-09] bounded memory and failed shared storage fail closed with 503, without disclosing provider data', async () => {
  const store = new MemoryRateLimitStore(() => 1000, 1);
  await consumeRateLimit(store, 'a', 'read', 1, 2);
  await assert.rejects(consumeRateLimit(store, 'b', 'read', 1, 2), { status: 503 });
  await assert.rejects(consumeRateLimit({ consume: async () => { throw Error('redis://password@private'); } }, 'a', 'read', 1, 2),
    error => error instanceof Error && !error.message.includes('password') && 'status' in error && error.status === 503);
});

test('[F2.2-09] public auth quota precedes JSON parsing and cannot be evaded by query, route or forged forwarding header', async () => {
  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/auth';
  try {
    for (const path of ['/login?attempt=1', '/recover?attempt=2']) {
      const response = await network(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 400);
    }
    const response = await network(base + '/register?attempt=3', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.33' }, body: '{invalid' });
    assert.equal(response.status, 429); assert.ok(Number(response.headers.get('retry-after')) >= 1);
    assert.equal((await response.json()).error.code, 'RATE_LIMITED');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('[F2.2-09] verified UUID shares read quota across refreshed tokens and paths; writes and users have independent quotas', async () => {
  const { createApp } = await import('../src/app.js');
  const app = createApp({ getActiveMap: async () => ({ campusId: campus, status: 'ACTIVE', version: 1,
    createdAt: new Date(), updatedAt: new Date(), buildings: [] }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1';
  const headers = { Authorization: 'Bearer first.valid.token', 'Content-Type': 'application/json' };
  try {
    for (const path of ['/auth/me', '/maps/' + campus + '/active', '/auth/me?changed=1']) assert.equal((await network(base + path, { headers })).status, 200);
    const response = await network(base + '/auth/me?changed=2', { headers: { Authorization: 'Bearer renewed.valid.token' } });
    assert.equal(response.status, 429);
    const write = await network(base + '/activities', { method: 'POST', headers, body: '{}' }); assert.equal(write.status, 400);
    userId = '33333333-3333-4333-8333-333333333333';
    assert.equal((await network(base + '/auth/me', { headers })).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('[F2.2-09] production refuses local-only counters; limits validate configuration without exposing credentials', async () => {
  const { loadEnv } = await import('../src/config/env.js');
  const base = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost', SUPABASE_URL: 'https://example.invalid', SUPABASE_PUBLISHABLE_KEY: 'test' };
  assert.throws(() => loadEnv(base), /RATE_LIMIT_REDIS_URL is required/);
  const valid = { ...base, RATE_LIMIT_REDIS_URL: 'redis://localhost:6379' };
  assert.equal(loadEnv(valid).rateLimitReadMax, 300);
  assert.throws(() => loadEnv({ ...valid, RATE_LIMIT_WRITE_MAX: '0' }), /RATE_LIMIT_WRITE_MAX/);
  assert.throws(() => loadEnv({ ...valid, RATE_LIMIT_REDIS_URL: 'https://secret:password@host' }), error =>
    error instanceof Error && error.message.includes('RATE_LIMIT_REDIS_URL') && !error.message.includes('password'));
});

test('[F2.2-09] CORS preflight consumes origin quota and exposes Retry-After on a rejected request', async () => {
  const { createApp } = await import('../src/app.js');
  const server = createApp({ rateLimitStore: { consume: async () => ({ count: 1001, retryAfterSeconds: 2 }) } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await network('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/auth/me', {
      method: 'OPTIONS', headers: { Origin: 'https://client.invalid', 'Access-Control-Request-Method': 'GET' },
    });
    assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '2');
    assert.ok(response.headers.get('access-control-expose-headers')?.includes('Retry-After'));
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('[F2.2-09] real Redis serializes concurrent requests from two clients and shares its TTL', {
  skip: !process.env.F22_REDIS_TEST_URL,
}, async () => {
  const { consumeScript } = await import('../src/database/redis/rate-limit.redis.js');
  const clients = [createClient({ url: process.env.F22_REDIS_TEST_URL }), createClient({ url: process.env.F22_REDIS_TEST_URL })];
  await Promise.all(clients.map(client => client.connect()));
  const key = 'campuslink:qa:' + crypto.randomUUID();
  try {
    const counts = await Promise.all(Array.from({ length: 40 }, (_, index) => clients[index % 2].eval(consumeScript, {
      keys: [key], arguments: ['2000'],
    }) as Promise<[number, number]>));
    assert.deepEqual(counts.map(result => result[0]).sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 1));
    assert.ok(counts.every(result => result[1] > 0 && result[1] <= 2000));
    assert.equal(await clients[0].get(key), '40');
    assert.ok(await clients[1].pTTL(key) > 0);
    await clients[0].pExpire(key, 1);
    await new Promise(resolve => setTimeout(resolve, 15));
    const fresh = await clients[1].eval(consumeScript, { keys: [key], arguments: ['2000'] });
    assert.equal((fresh as number[])[0], 1);
  } finally { await clients[0].del(key); await Promise.all(clients.map(client => client.quit())); }
});

test('[F2.2-09] two HTTP application instances enforce the same Redis quota and an outage denies instead of bypassing it', {
  skip: !process.env.F22_REDIS_TEST_URL,
}, async () => {
  const { env } = await import('../src/config/env.js');
  const { closeRateLimitRedis, redisRateLimitStore } = await import('../src/database/redis/rate-limit.redis.js');
  const { createApp } = await import('../src/app.js');
  env.rateLimitRedisUrl = process.env.F22_REDIS_TEST_URL;
  const servers = [createApp({ rateLimitStore: redisRateLimitStore }).listen(0, '127.0.0.1'),
    createApp({ rateLimitStore: redisRateLimitStore }).listen(0, '127.0.0.1')];
  await Promise.all(servers.map(server => once(server, 'listening')));
  const urls = servers.map(server => 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/v1/auth/login');
  try {
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
    assert.equal((await network(urls[0], options)).status, 400);
    assert.equal((await network(urls[1], options)).status, 400);
    const limited = await network(urls[0] + '?new=parameter', options);
    assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
    await closeRateLimitRedis();
    env.rateLimitRedisUrl = 'redis://127.0.0.1:1';
    assert.equal((await network(urls[1], options)).status, 503);
  } finally {
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    await closeRateLimitRedis(); env.rateLimitRedisUrl = undefined;
  }
});
