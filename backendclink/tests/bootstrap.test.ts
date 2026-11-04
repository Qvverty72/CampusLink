import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { before, mock, test } from 'node:test';
import { MongoClient } from 'mongodb';

let api: typeof import('../src/bootstrap.js');
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017',
    SUPABASE_URL: 'https://bootstrap-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' });
  api = await import('../src/bootstrap.js');
});

test('bootstrap connects and verifies readiness before listening; shutdown drains HTTP and closes Mongo', async () => {
  const calls: string[] = [];
  const server = createServer((_request, response) => response.end('ok'));
  const closeMongo = mock.method(MongoClient.prototype, 'close', async () => { calls.push('mongo-close'); });
  try {
    const result = await api.startApi({
      connect: async () => { calls.push('connect'); },
      verify: async () => { calls.push('verify'); return { status: 'ok', modules: [] }; },
      close: async () => { calls.push('failure-close'); },
      listen: async () => { calls.push('listen'); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server; },
    });
    assert.equal(result, server);
    assert.deepEqual(calls, ['connect', 'verify', 'listen']);
    await api.stopApi(server);
    assert.equal(server.listening, false);
    assert.equal(closeMongo.mock.callCount(), 1);
  } finally {
    closeMongo.mock.restore();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});

test('bootstrap failures close dependencies and expose only the sanitized startup error', async () => {
  for (const phase of ['connect', 'verify', 'listen']) {
    let closed = 0, listened = 0;
    const fail = () => { throw new Error('private-provider-detail'); };
    await assert.rejects(api.startApi({
      connect: async () => { if (phase === 'connect') fail(); },
      verify: async () => { if (phase === 'verify') fail(); return { status: 'ok', modules: [] }; },
      close: async () => { closed++; },
      listen: async (): Promise<Server> => { listened++; return fail(); },
    }), { message: 'API startup failed; check configuration and required dependencies' });
    assert.equal(closed, 1);
    assert.equal(listened, phase === 'listen' ? 1 : 0);
  }
});

test('unavailable readiness closes dependencies without opening the HTTP port', async () => {
  let closed = 0, listened = 0;
  await assert.rejects(api.startApi({
    connect: async () => {},
    verify: async () => ({ status: 'unavailable', modules: [] }),
    close: async () => { closed++; },
    listen: async () => { listened++; throw new Error('Must not listen'); },
  }), /API startup failed/);
  assert.equal(closed, 1);
  assert.equal(listened, 0);
});
