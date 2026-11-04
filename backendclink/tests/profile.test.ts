import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { mock } from 'node:test';

const user = '11111111-1111-4111-8111-111111111111';
const campus = '22222222-2222-4222-8222-222222222222';
const nextCampus = '33333333-3333-4333-8333-333333333333';
const institution = '44444444-4444-4444-8444-444444444444';
const career = '55555555-5555-4555-8555-555555555555';
const secondCareer = '66666666-6666-4666-8666-666666666666';
const wrongCareer = '77777777-7777-4777-8777-777777777777';
const foreignCampus = '88888888-8888-4888-8888-888888888888';
const timestamp = '2026-10-08T12:00:00.123456+00:00';
const publicKey = 'sb_publishable_test', serverKey = 'sb_secret_test', token = 'test.access.token';
const originalFetch = globalThis.fetch;
let server: Server, base: string;
let profile: Record<string, unknown>, calls: URL[], writes: Record<string, unknown>[];
let transactionError: boolean, lockedChange: string | undefined, failedTable: string | undefined, authInvalid: boolean;
let catalogInactive: boolean;
let serverProfileWrong = false;
let releaseCount = 0, rollbackCount = 0;
let closePostgres: () => Promise<void>;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://profile-test.invalid', SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: serverKey,
    SUPABASE_DB_URL: 'postgresql://postgres:simulated@profile-test.invalid/postgres' });
  mock.method(Pool.prototype, 'connect', async () => {
    let saved: Record<string, unknown> | undefined;
    return { release: () => { releaseCount++; }, query: async (sql: string, params: unknown[] = []) => {
      if (sql === 'BEGIN' || sql.startsWith('SELECT set_config')) return { rows: [] };
      if (sql === 'COMMIT') { if (saved) profile = { ...profile, ...saved }; return { rows: [] }; }
      if (sql === 'ROLLBACK') { rollbackCount++; return { rows: [] }; }
      if (transactionError) throw new Error('private PostgreSQL details');
      if (sql.includes('FROM public.perfil_usuario')) {
        assert.equal(params[0], user);
        return { rows: [{ ...profile, version_matches: params[1] === profile.updated_at && lockedChange !== 'version',
          ...(lockedChange === 'account' ? { estado_cuenta: 'SUSPENDIDA' } : {}) }] };
      }
      if (sql.includes('FROM public.usuario_rol')) return { rows: lockedChange === 'roles' ? [] : [{ id: 'role', name: 'ADMINISTRADOR', campusId: campus }] };
      if (sql.includes('FROM public.campus WHERE')) return { rows: [{ id: params[0], institucion_id: params[0] === foreignCampus ? foreignCampus : institution, activo: !catalogInactive }] };
      if (sql.includes('FROM public.carrera')) {
        if (failedTable === 'carrera') throw new Error('private database details');
        return { rows: (params[0] as string[]).map(id => ({ id, institucion_id: institution, activo: true })) };
      }
      if (sql.includes('FROM public.campus_carrera')) return { rows: (params[1] as string[])
        .filter(id => id !== wrongCareer || params[0] === campus).map(id => ({ carrera_id: id })) };
      if (sql.startsWith('UPDATE public.perfil_usuario')) {
        assert.equal(params[0], user);
        writes.push({ fullName: params[1], campusId: params[2] });
        saved = { nombre_completo: params[1], campus_id: params[2], updated_at: '2026-10-08T13:00:00.123456Z' };
        return { rows: [{ updated_at: saved.updated_at }] };
      }
      if (sql.startsWith('DELETE FROM public.usuario_carrera') || sql.startsWith('INSERT INTO public.usuario_carrera')) {
        assert.equal(params[0], user);
        if (sql.startsWith('INSERT')) writes.at(-1)!.careerIds = params[1];
        return { rows: [] };
      }
      throw new Error('Unexpected SQL');
    } };
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://profile-test.invalid'); calls.push(url);
    const headers = new Headers(init?.headers), table = url.pathname.split('/').at(-1);
    const secret = headers.get('apikey') === serverKey;
    assert.equal(headers.get('authorization'), 'Bearer ' + (secret ? serverKey : token));
    if (table === failedTable) throw new Error('private provider details');
    if (url.pathname === '/auth/v1/user') {
      assert.equal(secret, false);
      return authInvalid ? Response.json({ msg: 'private token', code: 'bad_jwt' }, { status: 401 })
        : Response.json({ id: user, email: 'person@duocuc.cl', email_confirmed_at: timestamp });
    }
    if (table === 'perfil_usuario') {
      assert.equal(url.searchParams.get('id'), 'eq.' + user);
      if (secret) assert.ok(url.searchParams.get('select')?.includes('campus!perfil_usuario_campus_id_fkey'));
      return Response.json([{ ...profile, ...(secret && serverProfileWrong ? { id: foreignCampus } : {}) }]);
    }
    if (table === 'usuario_rol' || table === 'usuario_permiso') {
      assert.equal(secret, false); assert.equal(url.searchParams.get('perfil_usuario_id'), 'eq.' + user);
      assert.equal(url.searchParams.get('revocado_en'), 'is.null');
      return Response.json(table === 'usuario_rol' ? [{ campus_id: campus, rol: { id: 'role', nombre: 'ADMINISTRADOR' } }] : []);
    }
    assert.equal(secret, true);
    if (table === 'campus' || table === 'carrera') {
      assert.equal(url.searchParams.get('institucion_id'), 'eq.' + institution);
      assert.equal(url.searchParams.get('activo'), 'eq.true');
      return Response.json(table === 'campus' ? [
        { id: campus, nombre: 'Old', institucion_id: institution, activo: true },
        { id: nextCampus, nombre: 'New', institucion_id: institution, activo: !catalogInactive },
        { id: foreignCampus, nombre: 'Foreign', institucion_id: foreignCampus, activo: true },
      ] : [career, secondCareer, wrongCareer].map(id => ({ id, nombre: id, institucion_id: institution, activo: true })));
    }
    if (table === 'campus_carrera') {
      assert.equal(url.searchParams.get('campus.institucion_id'), 'eq.' + institution);
      return Response.json([{ campus_id: campus, carrera_id: career }, { campus_id: nextCampus, carrera_id: career },
        { campus_id: nextCampus, carrera_id: secondCareer }, { campus_id: campus, carrera_id: wrongCareer }]);
    }
    throw new Error('Unexpected Supabase request: RPC must never be called');
  };
  const { createApp } = await import('../src/app.js');
  ({ closePostgres } = await import('../src/database/supabase/postgres.js'));
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
beforeEach(() => {
  serverProfileWrong = false;
  calls = []; writes = []; transactionError = false; lockedChange = undefined; failedTable = undefined; authInvalid = false; catalogInactive = false;
  releaseCount = 0; rollbackCount = 0;
  profile = { id: user, campus_id: campus, institucion_id: institution, nombre_completo: 'Before', foto_path: null,
    estado_cuenta: 'ACTIVA', deleted_at: null, verificado_en: timestamp, updated_at: timestamp,
    campus: { id: campus, nombre: 'Old' }, usuario_carrera: [{ carrera: { id: career, nombre: 'First' } }] };
});
test('server profile response must belong to the authenticated owner', async () => {
  serverProfileWrong = true;
  assert.equal((await request()).status, 403);
});
test('cached administrator role cannot authorize an unverified profile after transactional revocation', async () => {
  profile.verificado_en = null; lockedChange = 'roles';
  assert.equal((await request(undefined, payload())).status, 403);
  assert.equal(writes.length, 0); assert.equal(rollbackCount, 1);
});
after(async () => { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await closePostgres(); mock.restoreAll(); });
const payload = () => ({ fullName: ' After ', campusId: nextCampus, careerIds: [career, secondCareer], updatedAt: timestamp });
const request = (path = '/users/me/profile', body?: unknown, authorization = 'Bearer ' + token) => originalFetch(base + '/api/v1' + path, {
  method: body === undefined ? 'GET' : 'PATCH', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('own profile read returns campus/careers/version, never sensitive fields, and disables caching', async () => {
  const result = await request(); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await result.json()).data, { fullName: 'Before', campusId: campus, campusName: 'Old', careers: [{ id: career, nombre: 'First' }], updatedAt: timestamp });
});
test('academic catalogue restricts institution, active campuses and offered careers', async () => {
  catalogInactive = true;
  const result = await request('/users/me/profile-options'); assert.equal(result.status, 200);
  const options = (await result.json()).data;
  assert.deepEqual(options.campuses, [{ id: campus, name: 'Old' }]);
  assert.deepEqual(options.careers.find((row: { id: string }) => row.id === secondCareer).campusIds, []);
});
test('save accepts multiple/no careers, trims name, keeps exact timestamp and reevaluates campus permissions', async () => {
  const result = await request(undefined, payload()); assert.equal(result.status, 200);
  assert.equal(writes[0].fullName, 'After');
  assert.deepEqual(writes[0].careerIds, [career, secondCareer]);
  assert.equal(releaseCount, 1); assert.equal(rollbackCount, 0);
  assert.ok(!calls.some(url => url.pathname.includes('/rpc/')));
  const me = await request('/auth/me'); const identity = (await me.json()).data;
  assert.equal(identity.campusId, nextCampus); assert.equal(identity.capabilities.analytics, false);
  assert.equal(identity.capabilities.general, true);
  assert.equal((await request(undefined, { ...payload(), updatedAt: profile.updated_at, careerIds: [] })).status, 200);
});
test('invalid shape, identifiers, duplicates and protected attributes never reach persistence', async () => {
  for (const body of [null, [], {}, { ...payload(), fullName: ' ' }, { ...payload(), fullName: 'X'.repeat(201) },
    { ...payload(), fullName: 'x\nname' }, { ...payload(), campusId: 'bad' }, { ...payload(), updatedAt: 'bad' }, { ...payload(), updatedAt: '2026-02-30T12:00:00Z' },
    { ...payload(), careerIds: [career, career.toUpperCase()] }, { ...payload(), careerIds: [null] },
    { ...payload(), id: user }, { ...payload(), estado_cuenta: 'ACTIVA' }, { ...payload(), roles: ['ADMINISTRADOR'] }]) {
    assert.equal((await request(undefined, body)).status, 400, JSON.stringify(body));
  }
  assert.deepEqual(writes, []);
});
test('foreign/inactive campus and careers not offered in selected campus are rejected', async () => {
  assert.equal((await request(undefined, { ...payload(), campusId: foreignCampus })).status, 400);
  assert.equal((await request(undefined, { ...payload(), careerIds: [wrongCareer] })).status, 400);
  catalogInactive = true; assert.equal((await request(undefined, payload())).status, 400);
  assert.deepEqual(writes, []);
});
test('missing/expired session and suspended/deleted accounts never write', async () => {
  assert.equal((await request(undefined, payload(), '')).status, 401); assert.deepEqual(calls, []);
  authInvalid = true; assert.equal((await request(undefined, payload())).status, 401); authInvalid = false;
  profile.estado_cuenta = 'SUSPENDIDA'; assert.equal((await request(undefined, payload())).status, 403);
  profile.estado_cuenta = 'ACTIVA'; profile.deleted_at = timestamp; assert.equal((await request(undefined, payload())).status, 403);
  assert.deepEqual(writes, []);
});
test('concurrent edit, account change and catalogue race have safe public errors', async () => {
  for (const [change, status] of [['version', 409], ['account', 403], ['catalogue', 400], ['transport', 503]] as const) {
    lockedChange = change; catalogInactive = change === 'catalogue'; transactionError = change === 'transport';
    const result = await request(undefined, payload()); assert.equal(result.status, status);
    assert.ok(!JSON.stringify(await result.json()).includes('private'));
  }
  assert.deepEqual(writes, []); assert.equal(releaseCount, 4); assert.equal(rollbackCount, 4);
});
test('provider failure returns 503 without persisting or leaking details', async () => {
  failedTable = 'carrera'; const result = await request(undefined, payload());
  assert.equal(result.status, 503); assert.ok(!JSON.stringify(await result.json()).includes('private')); assert.deepEqual(writes, []);
});
