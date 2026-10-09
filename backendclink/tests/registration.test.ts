import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const userId = '11111111-1111-4111-8111-111111111111';
const campusId = '22222222-2222-4222-8222-222222222222';
const institution = '44444444-4444-4444-8444-444444444444';
const foreignCampus = '33333333-3333-4333-8333-333333333333';
const token = 'test.access.token';
const publicKey = 'sb_publishable_test';
const serverKey = 'sb_secret_server_only';
const originalFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;
let calls: { path: string; method: string; body: Record<string, unknown> }[];
let signupStatus: number;
let signupCode: string;
let catalogFails: boolean;
let immediateSession: boolean;
let obfuscated: boolean;
let signupAlreadyConfirmed: boolean;
let emailConfirmed: boolean;
let authInvalid: boolean;
let otpInvalid: boolean;
let profileFails: boolean;
let concurrentConflict: boolean;
let admissionActive: boolean;
let authMetadata: Record<string, unknown>;
let profile: Record<string, unknown> | null;
let profilePosts: number;

const providerUser = () => ({ id: userId, email: 'person@duocuc.cl',
  email_confirmed_at: emailConfirmed ? '2026-10-08T12:00:00Z' : null,
  user_metadata: authMetadata });
function providerError(status: number, code: string) {
  return Response.json({ msg: 'private provider details', code }, { status, headers: { 'x-supabase-api-version': '2024-01-01' } });
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://registration-test.invalid', SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: serverKey });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://registration-test.invalid');
    const headers = new Headers(init?.headers);
    const method = init?.method ?? 'GET';
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ path: url.pathname, method, body });
    if (url.pathname.startsWith('/auth/v1/')) {
      assert.equal(headers.get('apikey'), publicKey);
      assert.equal(headers.get('authorization'), 'Bearer ' + (url.pathname.endsWith('/user') ? token : publicKey));
      if (url.pathname.endsWith('/signup')) {
        if (signupStatus !== 200) return providerError(signupStatus, signupCode);
        if (!obfuscated && !signupAlreadyConfirmed) authMetadata = body.data ?? {};
        return Response.json({ id: userId, email: body.email,
          email_confirmed_at: signupAlreadyConfirmed ? '2026-10-08T12:00:00Z' : null,
          identities: obfuscated ? [] : [{ id: 'identity-id', user_id: userId }],
          ...(immediateSession ? { access_token: token, refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer' } : {}) });
      }
      if (url.pathname.endsWith('/user')) return authInvalid ? providerError(401, 'bad_jwt') : Response.json(providerUser());
      if (url.pathname.endsWith('/verify')) {
        if (otpInvalid) return providerError(403, 'otp_expired');
        emailConfirmed = true;
        return Response.json({ access_token: token, refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user: providerUser() });
      }
      if (url.pathname.endsWith('/resend')) return Response.json({});
      throw new Error('Unexpected Auth request');
    }
    assert.ok(!url.pathname.includes('/rpc/'));
    assert.equal(headers.get('apikey'), serverKey);
    assert.equal(headers.get('authorization'), 'Bearer ' + serverKey);
    const table = url.pathname.split('/').at(-1);
    if (table === 'dominio_institucional') {
      if (catalogFails) throw new Error('private transport details');
      return Response.json([
        { dominio: 'duocuc.cl', institucion_id: institution, activo: admissionActive, institucion: { nombre: 'DUOC UC' } },
        { dominio: 'inactive.cl', institucion_id: 'other-institution', activo: false, institucion: { nombre: 'Inactive' } },
      ]);
    }
    if (table === 'campus') {
      assert.equal(url.searchParams.get('institucion_id'), 'in.(' + institution + ')');
      return Response.json([
        { id: campusId, institucion_id: institution, nombre: 'San Andres', activo: true },
        { id: foreignCampus, institucion_id: 'other-institution', nombre: 'Foreign', activo: true },
        { id: '55555555-5555-4555-8555-555555555555', institucion_id: institution, nombre: 'Inactive', activo: false },
      ]);
    }
    assert.equal(table, 'perfil_usuario');
    if (method === 'POST') {
      profilePosts++;
      if (profileFails) return Response.json({ code: 'connection_error', message: 'private db detail' }, { status: 500 });
      profile ??= { ...body, estado_cuenta: 'ACTIVA', deleted_at: null, foto_path: null };
      if (concurrentConflict) return Response.json({ code: '23505', message: 'unique collision' }, { status: 409 });
      return Response.json(profile);
    }
    assert.equal(url.searchParams.get('id'), 'eq.' + userId);
    return Response.json(profile ? [profile] : []);
  };
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
beforeEach(() => {
  calls = []; signupStatus = 200; signupCode = ''; catalogFails = false; immediateSession = false; obfuscated = false;
  signupAlreadyConfirmed = false;
  emailConfirmed = false; authInvalid = false; otpInvalid = false; profileFails = false;
  concurrentConflict = false; admissionActive = true; authMetadata = {}; profile = null; profilePosts = 0;
});
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const input = () => ({ email: ' Person@DUOCUC.CL ', fullName: ' Test Person ', password: 'private password', campusId });
function post(endpoint: string, body: unknown, authorization?: string) {
  return originalFetch(baseUrl + '/api/v1/auth/' + endpoint, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body) });
}
const register = (body: unknown = input()) => post('register', body);
const confirm = () => post('register/confirm', { email: 'person@duocuc.cl', code: '12345678' });
const complete = (body: unknown = {}) => post('register/complete', body, 'Bearer ' + token);

test('Express filters domain/campus admission from server-only repository data, without an RPC', async () => {
  const response = await originalFetch(baseUrl + '/api/v1/auth/registration-options');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data, [{ dominio: 'duocuc.cl', institucion_id: institution,
    institucion_nombre: 'DUOC UC', campus_id: campusId, campus_nombre: 'San Andres' }]);
});
test('signup stores name and campus in Auth metadata and never creates an unverified profile', async () => {
  const response = await register();
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: { status: 'verification_required' } });
  assert.equal(profile, null);
  const signup = calls.find(call => call.path.endsWith('/signup'))!;
  assert.equal(signup.body.email, 'person@duocuc.cl');
  assert.equal(signup.body.password, 'private password');
  assert.deepEqual(signup.body.data, { nombre_completo: 'Test Person', campus_id: campusId });
  assert.ok(!calls.some(call => call.path.endsWith('/perfil_usuario')));
});
test('invalid format and privilege fields fail before provider/persistence calls', async () => {
  for (const body of [null, [], {}, { ...input(), email: 'bad@@duocuc.cl' }, { ...input(), fullName: ' ' },
    { ...input(), campusId: 'bad' }, { ...input(), password: '' }, { ...input(), roles: ['ADMINISTRADOR'] },
    { ...input(), permissions: ['ANALITICA'] }, { ...input(), institucion_id: institution }]) {
    assert.equal((await register(body)).status, 400); assert.deepEqual(calls, []);
  }
});
test('exact domain and active campus of its institution are required before signup', async () => {
  for (const body of [{ ...input(), email: 'person@duocuc.cl.evil.com' }, { ...input(), email: 'person@alumnos.duocuc.cl' },
    { ...input(), email: 'person@gmail.com' }, { ...input(), campusId: foreignCampus },
    { ...input(), campusId: '55555555-5555-4555-8555-555555555555' }]) {
    calls = [];
    assert.equal((await register(body)).status, 400);
    assert.ok(calls.every(call => call.method === 'GET' && call.path.startsWith('/rest/v1/')));
  }
});
test('confirmed duplicates and obfuscated fake users keep the generic response without profile writes', async () => {
  signupStatus = 422; signupCode = 'user_already_exists';
  assert.equal((await register()).status, 202); assert.equal(profile, null);
  signupStatus = 200; obfuscated = true;
  assert.equal((await register()).status, 202); assert.equal(profile, null);
  signupAlreadyConfirmed = true;
  assert.equal((await register()).status, 202); assert.equal(profile, null);
});
test('password policy, rate limit and catalog errors are sanitized', async () => {
  for (const [status, code, expected] of [[422, 'weak_password', 400], [429, 'over_email_send_rate_limit', 429], [500, 'unexpected_failure', 503]] as const) {
    signupStatus = status; signupCode = code;
    const response = await register(); assert.equal(response.status, expected);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '60');
    assert.ok(!JSON.stringify(await response.json()).includes('private'));
  }
  signupStatus = 200; catalogFails = true; calls = [];
  assert.equal((await register()).status, 503);
  assert.ok(calls.every(call => call.path.endsWith('/dominio_institucional')));
});
test('autoconfirm configuration does not grant a profile or expose a signup session', async () => {
  immediateSession = true;
  const response = await register(); assert.equal(response.status, 503);
  assert.ok(!JSON.stringify(await response.json()).includes(token));
  assert.equal(profile, null);
});
test('completion requires a valid confirmed identity before any privileged read', async () => {
  assert.equal((await post('register/complete', {})).status, 401); assert.deepEqual(calls, []);
  authInvalid = true;
  assert.equal((await complete()).status, 401);
  assert.ok(calls.every(call => call.path.endsWith('/user')));
  authInvalid = false; calls = [];
  assert.equal((await complete()).status, 403);
  assert.deepEqual(calls.map(call => call.path), ['/auth/v1/user']);
});
test('OTP confirmation is coordinated by Express and provisions only validated Auth fields', async () => {
  await register(); calls = [];
  authMetadata.roles = ['ADMINISTRADOR'];
  const response = await confirm(); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).data, { status: 'complete', session: { access_token: token, refresh_token: 'refresh' } });
  assert.equal(calls[0].path, '/auth/v1/verify');
  assert.equal(profile?.nombre_completo, 'Test Person'); assert.equal(profile?.campus_id, campusId);
  assert.equal(profile?.verificado_en, '2026-10-08T12:00:00Z');
  assert.ok(calls.every(call => !/usuario_rol|usuario_permiso/.test(call.path)));
});
test('invalid or expired OTP never reaches profile persistence', async () => {
  await register(); calls = []; otpInvalid = true;
  assert.equal((await confirm()).status, 400);
  assert.deepEqual(calls.map(call => call.path), ['/auth/v1/verify']); assert.equal(profile, null);
  calls = [];
  assert.equal((await post('register/confirm', { email: 'person@duocuc.cl', code: '123', roles: ['ADMINISTRADOR'] })).status, 400);
  assert.deepEqual(calls, []);
});
test('verification preserves a session and Auth metadata lets an authenticated retry complete the profile', async () => {
  await register(); profileFails = true;
  const response = await confirm(); assert.equal(response.status, 200);
  assert.equal((await response.json()).data.status, 'profile_pending');
  assert.equal(profile, null);
  profileFails = false;
  assert.equal((await complete()).status, 200); assert.ok(profile);
  const posts = profilePosts;
  assert.equal((await complete()).status, 200); assert.equal(profilePosts, posts);
});
test('concurrent duplicate insert is recoverable without overwriting the profile', async () => {
  await register(); emailConfirmed = true; concurrentConflict = true;
  assert.equal((await complete()).status, 200); assert.ok(profile); assert.equal(profilePosts, 1);
  concurrentConflict = false;
  assert.equal((await complete()).status, 200); assert.equal(profilePosts, 1);
});
test('missing or tampered Auth registration metadata cannot provision an unrelated campus', async () => {
  emailConfirmed = true;
  assert.equal((await complete()).status, 403); assert.equal(profilePosts, 0);
  emailConfirmed = false; await register(); emailConfirmed = true;
  authMetadata.campus_id = foreignCampus;
  assert.equal((await complete()).status, 403); assert.equal(profilePosts, 0);
  assert.equal((await complete({ userId: 'other-user', roles: ['ADMINISTRADOR'] })).status, 400);
});
test('admission is rechecked at completion; existing suspended/deleted profiles are never reactivated', async () => {
  await register(); emailConfirmed = true; admissionActive = false;
  assert.equal((await complete()).status, 403); assert.equal(profile, null);
  admissionActive = true;
  profile = { id: userId, campus_id: campusId, estado_cuenta: 'SUSPENDIDA', deleted_at: null, nombre_completo: 'Preserved' };
  assert.equal((await complete()).status, 403); assert.equal(profilePosts, 0); assert.equal(profile.nombre_completo, 'Preserved');
  profile.estado_cuenta = 'ACTIVA'; profile.deleted_at = '2026-10-08T12:00:00Z';
  assert.equal((await complete()).status, 403); assert.equal(profilePosts, 0);
});
test('resend uses Express and public Auth credentials with a generic response', async () => {
  const response = await post('register/resend', { email: ' Person@DUOCUC.CL ' });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { data: { status: 'verification_required' } });
  assert.equal(calls.at(-1)?.body.type, 'signup');
  assert.equal(calls.at(-1)?.body.email, 'person@duocuc.cl');
  calls = [];
  assert.equal((await post('register/resend', { email: 'person@gmail.com' })).status, 400);
  assert.ok(calls.every(call => call.path.startsWith('/rest/v1/')));
});
