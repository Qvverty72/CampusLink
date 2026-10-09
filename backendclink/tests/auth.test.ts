import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { request, type Server } from 'node:http';

const userId = '11111111-1111-4111-8111-111111111111';
const campusId = '22222222-2222-4222-8222-222222222222';
const otherCampus = '33333333-3333-4333-8333-333333333333';
const token = 'test.access.token';
const originalFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;
let calls: URL[];
let authStatus: number;
let failTable: string | undefined;
let missingProfile: boolean;
let profile: Record<string, unknown>;
let permissionRows: unknown[];
let emailConfirmed: boolean;

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://auth-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test_do_not_use',
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://auth-test.invalid');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), 'sb_publishable_test');
    assert.equal(headers.get('authorization'), 'Bearer ' + token);
    calls.push(url);
    if (url.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify(authStatus === 200 ? { id: userId, email: 'user@duocuc.cl', email_confirmed_at: emailConfirmed ? '2026-10-08T12:00:00Z' : null } : {
        msg: 'provider private details ' + token, code: 'bad_jwt',
      }), { status: authStatus, headers: { 'Content-Type': 'application/json' } });
    }
    const table = url.pathname.split('/').at(-1);
    if (table === failTable) throw new Error('transport secret ' + token);
    assert.equal(calls[0].pathname, '/auth/v1/user');
    let rows: unknown[] = [];
    if (table === 'perfil_usuario') {
      assert.equal(url.searchParams.get('id'), 'eq.' + userId);
      rows = missingProfile ? [] : [profile];
    } else {
      assert.equal(url.searchParams.get('perfil_usuario_id'), 'eq.' + userId);
      assert.equal(url.searchParams.get('revocado_en'), 'is.null');
      rows = table === 'usuario_rol' ? [{ campus_id: campusId, rol: { id: 'role-id', nombre: 'ADMINISTRADOR' } }]
        : permissionRows;
    }
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
  };
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

beforeEach(() => {
  calls = []; authStatus = 200; failTable = undefined; missingProfile = false;
  emailConfirmed = true;
  profile = { id: userId, campus_id: campusId, institucion_id: 'institution-id',
    nombre_completo: 'Test User', foto_path: null, verificado_en: null, estado_cuenta: 'ACTIVA', deleted_at: null };
  permissionRows = [{ campus_id: otherCampus, permiso: { id: 'permission-id', nombre: 'PUBLICAR_EVENTO' } }];
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function me(authorization: string | undefined = 'Bearer ' + token) {
  return originalFetch(baseUrl + '/api/v1/auth/me', {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
}

test('unverified Auth email cannot use even an existing legacy profile', async () => {
  emailConfirmed = false;
  assert.equal((await me()).status, 403);
  assert.deepEqual(calls.map(url => url.pathname), ['/auth/v1/user']);
});

test('rejects missing and malformed credentials before any dependency query', async () => {
  for (const header of ['', 'Basic credentials', 'Bearer', 'Bearer token extra', 'Bearer a, Bearer b']) {
    const response = await me(header);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await originalFetch(baseUrl + '/api/v1/auth/me');
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test('invalid and expired tokens never reach PostgreSQL', async () => {
  for (const status of [400, 401, 403]) {
    calls = []; authStatus = status;
    const response = await me();
    assert.equal(response.status, 401);
    assert.deepEqual(calls.map(url => url.pathname), ['/auth/v1/user']);
    const body = JSON.stringify(await response.json());
    assert.ok(!body.includes(token));
    assert.ok(!body.includes('provider'));
  }
});

test('duplicate Authorization headers are rejected instead of selecting one credential', async () => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(baseUrl + '/api/v1/auth/me', {
      headers: { Authorization: ['Bearer ' + token, 'Bearer ' + token] },
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 401);
  assert.deepEqual(calls, []);
});

test('identity uses verified UUID; explicit roles and permissions keep separate campus scope', async () => {
  const response = await me('bearer ' + token);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.userId, userId);
  assert.equal(data.profile.id, userId);
  assert.equal(data.campusId, campusId);
  assert.deepEqual(data.roles, [{ id: 'role-id', name: 'ADMINISTRADOR', campusId }]);
  assert.deepEqual(data.permissions, [{ id: 'permission-id', name: 'PUBLICAR_EVENTO', campusId: otherCampus }]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(data).includes(token));
});

test('missing, mismatched, suspended, deactivated and deleted profiles cannot operate', async () => {
  for (const state of ['SUSPENDIDA', 'DESACTIVADA', 'UNKNOWN']) {
    calls = []; profile.estado_cuenta = state;
    assert.equal((await me()).status, 403);
    assert.equal(calls.length, 2);
  }
  profile.estado_cuenta = 'ACTIVA'; profile.deleted_at = '2026-10-08';
  assert.equal((await me()).status, 403);
  profile.deleted_at = null; profile.id = otherCampus;
  assert.equal((await me()).status, 403);
  missingProfile = true;
  assert.equal((await me()).status, 403);
});

test('the same device token sees current campus, permission revocation and suspension immediately', async () => {
  assert.equal((await me()).status, 200);
  calls = []; profile.campus_id = otherCampus; permissionRows = [];
  const { data } = await (await me()).json();
  assert.equal(data.campusId, otherCampus);
  assert.deepEqual(data.permissions, []);
  calls = []; profile.estado_cuenta = 'SUSPENDIDA';
  assert.equal((await me()).status, 403);
  assert.equal(calls.length, 2);
});

test('no permission is inferred from the administrator role', async () => {
  permissionRows = [];
  const { data } = await (await me()).json();
  assert.equal(data.roles.length, 1);
  assert.deepEqual(data.permissions, []);
});

test('dependency failures deny access with sanitized 503 errors', async () => {
  authStatus = 500;
  assert.equal((await me()).status, 503);
  authStatus = 200;
  for (const table of ['perfil_usuario', 'usuario_rol', 'usuario_permiso']) {
    calls = []; failTable = table;
    const response = await me();
    assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(await response.json()).includes(token));
  }
  failTable = undefined; permissionRows = [{ campus_id: campusId, permiso: null }];
  assert.equal((await me()).status, 503);
});

test('liveness remains public and detailed Auth diagnostics remain disabled in test', async () => {
  assert.equal((await originalFetch(baseUrl + '/api/v1/health')).status, 200);
  assert.equal((await originalFetch(baseUrl + '/api/v1/auth/health')).status, 404);
  assert.deepEqual(calls, []);
});
