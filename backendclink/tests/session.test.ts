import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const originalFetch = globalThis.fetch;
const publicKey = 'sb_publishable_test';
const accessToken = 'recovery.access.token';
const userId = '11111111-1111-4111-8111-111111111111';
let server: Server;
let baseUrl: string;
let calls: { path: string; method: string; body: Record<string, unknown> }[];
let loginStatus: number;
let recoveryStatus: number;
let verifyStatus: number;
let updateStatus: number;
let logoutStatus: number;
let consumed: boolean;
let transportFailure: boolean;
let userEmail: string;
let confirmed: boolean;
let currentPassword: string;

function providerError(status: number, code: string) {
  return Response.json({ msg: 'private provider details', code }, { status, headers: { 'x-supabase-api-version': '2024-01-01' } });
}
function providerSession() {
  return { access_token: accessToken, refresh_token: 'private.refresh.token', expires_in: 3600,
    token_type: 'bearer', user: { id: userId, email: userEmail,
      email_confirmed_at: confirmed ? '2026-10-08T12:00:00Z' : null } };
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://session-test.invalid', SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: 'sb_secret_server_only' });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://session-test.invalid');
    assert.ok(url.pathname.startsWith('/auth/v1/'), 'No database writes or admin APIs in login/recovery');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), publicKey);
    const method = init?.method ?? 'GET';
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ path: url.pathname, method, body });
    if (transportFailure) throw new Error('private transport details');
    if (url.pathname.endsWith('/token')) {
      assert.equal(headers.get('authorization'), 'Bearer ' + publicKey);
      assert.equal(url.searchParams.get('grant_type'), 'password');
      if (loginStatus !== 200) return providerError(loginStatus, 'invalid_credentials');
      if (body.password !== currentPassword) return providerError(400, 'invalid_credentials');
      return Response.json(providerSession());
    }
    if (url.pathname.endsWith('/recover')) {
      assert.equal(headers.get('authorization'), 'Bearer ' + publicKey);
      return recoveryStatus === 200 ? Response.json({}) : providerError(recoveryStatus, 'user_not_found');
    }
    if (url.pathname.endsWith('/verify')) {
      assert.equal(headers.get('authorization'), 'Bearer ' + publicKey);
      assert.equal(body.type, 'recovery');
      if (verifyStatus !== 200 || consumed) return providerError(verifyStatus === 200 ? 403 : verifyStatus, 'otp_expired');
      consumed = true;
      return Response.json(providerSession());
    }
    if (url.pathname.endsWith('/user')) {
      assert.equal(method, 'PUT');
      assert.equal(headers.get('authorization'), 'Bearer ' + accessToken);
      assert.deepEqual(Object.keys(body).sort(), ['code_challenge', 'code_challenge_method', 'password']);
      if (updateStatus !== 200) return providerError(updateStatus, 'weak_password');
      currentPassword = body.password;
      return Response.json(providerSession().user);
    }
    if (url.pathname.endsWith('/logout')) {
      assert.equal(headers.get('authorization'), 'Bearer ' + accessToken);
      assert.equal(url.searchParams.get('scope'), 'local');
      return logoutStatus === 200 ? Response.json({}) : providerError(logoutStatus, 'unexpected_failure');
    }
    throw new Error('Unexpected Auth call');
  };
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
beforeEach(() => {
  calls = []; loginStatus = recoveryStatus = verifyStatus = updateStatus = logoutStatus = 200;
  consumed = false; transportFailure = false; userEmail = 'person@gmail.com'; confirmed = true; currentPassword = 'old password';
});
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
function post(endpoint: string, body: unknown) {
  return originalFetch(baseUrl + '/api/v1/auth/' + endpoint, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const login = (password = currentPassword) => post('login', { email: ' Person@GMAIL.COM ', password });
const reset = () => post('recover/confirm', { email: 'person@gmail.com', code: '123456', password: 'new private password' });

test('login accepts non-institutional administrator emails and transports only the SDK session', async () => {
  const response = await login();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: { session: { access_token: accessToken, refresh_token: 'private.refresh.token' } } });
  assert.equal(calls[0].body.email, 'person@gmail.com');
  assert.equal(calls.length, 1);
});

test('credential exchanges reject injected roles/identity and malformed input before Auth', async () => {
  for (const body of [null, [], {}, { email: 'bad', password: 'x' }, { email: 'a@b.cl', password: '' },
    { email: 'a@b.cl', password: 'x', roles: ['ADMINISTRADOR'] }]) {
    assert.equal((await post('login', body)).status, 400); assert.deepEqual(calls, []);
  }
  for (const body of [{ email: 'a@b.cl', code: '123', password: 'x' },
    { email: 'a@b.cl', code: '123456', password: 'x', userId }, { email: 'a@b.cl', password: 'x' }]) {
    assert.equal((await post('recover/confirm', body)).status, 400); assert.deepEqual(calls, []);
  }
  assert.equal((await post('recover', { email: 'a@b.cl', redirectTo: 'https://evil.invalid' })).status, 400);
});

test('invalid, banned and unconfirmed credentials give sanitized errors; outages and rate limits are distinct', async () => {
  for (const status of [400, 401, 403, 422]) {
    loginStatus = status;
    const response = await login();
    assert.equal(response.status, 401);
    assert.ok(!(await response.text()).includes('private'));
  }
  loginStatus = 200; confirmed = false;
  assert.equal((await login()).status, 401);
  confirmed = true; loginStatus = 429;
  const rate = await login(); assert.equal(rate.status, 429); assert.equal(rate.headers.get('retry-after'), '60');
  loginStatus = 500; assert.equal((await login()).status, 503);
});

test('recovery never reveals account existence, provider errors, rate limits or delivery failures', async () => {
  for (const status of [200, 400, 403, 422, 429, 500]) {
    recoveryStatus = status;
    const response = await post('recover', { email: status === 200 ? 'person@gmail.com' : 'absent@example.com' });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { data: { status: 'recovery_requested' } });
  }
  transportFailure = true;
  assert.deepEqual(await (await post('recover', { email: 'person@gmail.com' })).json(), { data: { status: 'recovery_requested' } });
});

test('recovery OTP updates the password, retires its session and never returns tokens or the old password', async () => {
  const response = await reset();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: { status: 'password_updated' } });
  assert.deepEqual(calls.map(call => call.path), ['/auth/v1/verify', '/auth/v1/user', '/auth/v1/logout']);
  assert.equal((await login('old password')).status, 401);
  assert.equal((await login('new private password')).status, 200);
});

test('expired, reused and mismatched OTP cannot update credentials', async () => {
  verifyStatus = 403;
  assert.equal((await reset()).status, 400);
  assert.ok(!calls.some(call => call.method === 'PUT'));
  calls = []; verifyStatus = 200; userEmail = 'someone@example.com';
  assert.equal((await reset()).status, 400);
  assert.ok(!calls.some(call => call.method === 'PUT'));
  calls = []; consumed = false; userEmail = 'person@gmail.com';
  assert.equal((await reset()).status, 200);
  calls = [];
  assert.equal((await reset()).status, 400);
  assert.ok(!calls.some(call => call.method === 'PUT'));
});

test('weak passwords and Auth update failures require a new OTP without exposing a recovery session', async () => {
  updateStatus = 422;
  const weak = await reset(); assert.equal(weak.status, 400);
  assert.ok(!(await weak.text()).includes(accessToken));
  assert.equal(currentPassword, 'old password');
  assert.equal(calls.at(-1)?.path, '/auth/v1/logout');
  consumed = false; updateStatus = 500;
  assert.equal((await reset()).status, 503);
  assert.equal(currentPassword, 'old password');
  assert.equal(calls.at(-1)?.path, '/auth/v1/logout');
});

test('ephemeral recovery session never contaminates later public login requests', async () => {
  logoutStatus = 500;
  assert.equal((await reset()).status, 200);
  assert.equal((await login()).status, 200);
  assert.equal(calls.at(-1)?.path, '/auth/v1/token');
});
