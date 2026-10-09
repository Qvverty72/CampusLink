import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { ObjectId, type Db } from 'mongodb';
import type { CampusReference, UserReference } from '../src/types/references.js';
import type { CampusMapDocument, MapRepository, NewCampusMap } from '../src/modules/maps/map.types.js';
import { createReferenceValidator } from '../src/services/references.js';
import { ApiError } from '../src/services/apiError.js';

const campusId = 'a2222222-2222-4222-8222-222222222222';
const userId = 'b1111111-1111-4111-8111-111111111111';
const otherCampus = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
let campus: CampusReference | null;
let user: UserReference | null;
let failTable: string | undefined;
let queries: URL[];
let validator: ReturnType<typeof createReferenceValidator>;
let createMapService: typeof import('../src/modules/maps/map.service.js').createMapService;

before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017',
    SUPABASE_URL: 'https://references-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test_do_not_use' });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://references-test.invalid');
    assert.equal(init?.method ?? 'GET', 'GET'); // This task never writes PostgreSQL.
    queries.push(url);
    const table = url.pathname.split('/').at(-1);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), 'sb_secret_test_do_not_use');
    if (table === failTable) throw new Error('private transport details');
    assert.equal(url.searchParams.get('id'), 'eq.' + (table === 'campus' ? campusId : userId));
    assert.equal(url.searchParams.get('select'), table === 'campus' ? 'id,institucion_id,activo'
      : 'id,campus_id,institucion_id,estado_cuenta,deleted_at');
    const row = table === 'campus' ? campus : user;
    return new Response(JSON.stringify(row), { headers: { 'Content-Type': 'application/json' } });
  };
  validator = createReferenceValidator();
  ({ createMapService } = await import('../src/modules/maps/map.service.js'));
});

beforeEach(() => {
  campus = { id: campusId, institucion_id: 'institution', activo: true };
  user = { id: userId, campus_id: campusId, institucion_id: 'institution', estado_cuenta: 'ACTIVA', deleted_at: null };
  queries = []; failTable = undefined;
});
after(() => { globalThis.fetch = originalFetch; });

function errorStatus(status: number) {
  return (error: unknown) => error instanceof ApiError && error.status === status
    && !error.message.includes('private');
}
const refs = () => ({ campusId, users: [{ id: userId, field: 'creatorUserId' }] });

test('real Supabase repository projects only reference fields and normalizes UUIDs', async () => {
  assert.deepEqual(await validator.assertReferences({ campusId: campusId.toUpperCase(),
    users: [{ id: userId.toUpperCase(), field: 'creatorUserId' }] }), refs());
  assert.deepEqual(queries.map(query => query.pathname), ['/rest/v1/campus', '/rest/v1/perfil_usuario']);
});

test('malformed UUIDs are rejected before any dependency access', async () => {
  for (const references of [{ campusId: 'bad' }, { ...refs(), users: [{ id: 'bad', field: 'userId' }] }]) {
    await assert.rejects(validator.assertReferences(references), errorStatus(400));
  }
  assert.equal(queries.length, 0);
});

test('missing and inactive campuses cannot be written or exposed', async () => {
  for (const row of [null, { ...campus!, activo: false }]) {
    campus = row;
    await assert.rejects(validator.assertReferences(refs()), errorStatus(409));
    assert.equal(await validator.areReferencesCurrent(refs()), false);
  }
  assert.ok(queries.every(query => query.pathname === '/rest/v1/campus'));
});

test('missing, suspended, deactivated and deleted users cannot be referenced operationally', async () => {
  const active = user!;
  for (const row of [null, { ...active, estado_cuenta: 'SUSPENDIDA' as const },
    { ...active, estado_cuenta: 'DESACTIVADA' as const }, { ...active, deleted_at: '2026-10-08' }]) {
    user = row;
    await assert.rejects(validator.assertReferences(refs()), errorStatus(409));
    assert.equal(await validator.areReferencesCurrent(refs()), false);
  }
});

test('users of another campus or institution are rejected even with a valid UUID', async () => {
  const active = user!;
  for (const row of [{ ...active, campus_id: otherCampus }, { ...active, institucion_id: 'other' }]) {
    user = row;
    await assert.rejects(validator.assertReferences(refs()), errorStatus(409));
  }
});

test('Supabase transport failure is a sanitized 503, never missing reference/success', async () => {
  for (const table of ['campus', 'perfil_usuario']) {
    failTable = table;
    await assert.rejects(validator.assertReferences(refs()), errorStatus(503));
    await assert.rejects(validator.areReferencesCurrent(refs()), errorStatus(503));
  }
});

function mapHarness() {
  const mapId = new ObjectId();
  const input: NewCampusMap = { campusId, version: 1, schemaVersion: 1, status: 'ACTIVE', buildings: [],
    model: { key: 'test', assetPath: 'test.glb', dataSource: 'fixture', sourceHash: 'fixture' } };
  let stored: CampusMapDocument = { ...input, _id: mapId, createdAt: new Date(), updatedAt: new Date() };
  let writes = 0;
  let failure: unknown;
  let afterRead: (() => void) | undefined;
  const repository: MapRepository = {
    findActiveMapByCampusId: async () => { if (failure) throw failure; afterRead?.(); return stored; },
    findMapById: async (id, campus) => { if (failure) throw failure; return stored._id?.equals(id) && stored.campusId === campus ? stored : null; },
    insertMap: async document => { writes++; if (failure) throw failure; stored = { ...document, _id: mapId }; return stored; },
    updateMap: async (_id, _campus, changes) => { writes++; if (failure) throw failure; stored = { ...stored, ...changes }; return stored; },
  };
  return { service: createMapService(repository, validator), mapId, input, get stored() { return stored; },
    get writes() { return writes; }, set failure(error: unknown) { failure = error; },
    set afterRead(callback: () => void) { afterRead = callback; } };
}

test('map reads retain the DTO and writes preserve ObjectId, campus/version and creation date', async () => {
  const harness = mapHarness();
  assert.deepEqual(await harness.service.getActiveMap(campusId), harness.stored);
  const created = await harness.service.createMap(harness.input);
  assert.ok(created._id instanceof ObjectId);
  const updated = await harness.service.updateMap(harness.mapId, campusId, {
    status: 'ARCHIVED', campusId: otherCampus, _id: new ObjectId(), version: 99,
  } as Parameters<typeof harness.service.updateMap>[2]);
  assert.ok(updated._id?.equals(harness.mapId));
  assert.equal(updated.campusId, campusId);
  assert.equal(updated.version, 1);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.status, 'ARCHIVED');
});

test('map reads hide inactive/missing/cross-campus references without deleting the stored map', async () => {
  const harness = mapHarness();
  campus!.activo = false;
  assert.equal(await harness.service.getActiveMap(campusId), null);
  campus!.activo = true;
  harness.stored.campusId = otherCampus;
  assert.equal(await harness.service.getActiveMap(campusId), null);
  assert.equal(harness.writes, 0);
});

test('campus is rechecked after MongoDB read; reads fail closed on PostgreSQL/MongoDB failure', async () => {
  const harness = mapHarness();
  harness.afterRead = () => { campus!.activo = false; };
  assert.equal(await harness.service.getActiveMap(campusId), null);
  campus!.activo = true;
  harness.failure = new Error('private MongoDB URI');
  await assert.rejects(harness.service.getActiveMap(campusId), errorStatus(503));
  harness.failure = undefined;
  failTable = 'campus';
  await assert.rejects(harness.service.getActiveMap(campusId), errorStatus(503));
});

test('no map write runs when references are invalid or PostgreSQL is unavailable', async () => {
  const harness = mapHarness();
  for (const unavailable of [false, true]) {
    campus!.activo = unavailable;
    failTable = unavailable ? 'campus' : undefined;
    await assert.rejects(harness.service.createMap(harness.input), errorStatus(unavailable ? 503 : 409));
    await assert.rejects(harness.service.updateMap(harness.mapId, campusId, { status: 'ARCHIVED' }), errorStatus(unavailable ? 503 : 409));
  }
  assert.equal(harness.writes, 0);
});

test('unacknowledged/failed MongoDB operations cannot be confirmed and are never repeated by services', async () => {
  const harness = mapHarness();
  harness.failure = new Error('private write timeout; outcome uncertain');
  await assert.rejects(harness.service.createMap(harness.input), errorStatus(503));
  assert.equal(harness.writes, 1);
  harness.failure = { code: 11000, message: 'private duplicate key' };
  await assert.rejects(harness.service.createMap(harness.input), errorStatus(409));
  harness.failure = { code: 121, message: 'private validator detail' };
  await assert.rejects(harness.service.createMap(harness.input), errorStatus(400));
});

test('map writes reject malformed document ids, invalid states and foreign campus targets', async () => {
  const harness = mapHarness();
  await assert.rejects(harness.service.updateMap('bad' as unknown as ObjectId, campusId, {}), errorStatus(400));
  await assert.rejects(harness.service.createMap({ ...harness.input, status: 'bad' as 'ACTIVE' }), errorStatus(400));
  await assert.rejects(harness.service.updateMap(harness.mapId, otherCampus, {}), errorStatus(404));
  assert.equal(harness.writes, 0);
});

test('validation has no persistent cache: campus/user changes apply on the next operation', async () => {
  assert.equal(await validator.areReferencesCurrent(refs()), true);
  user!.campus_id = otherCampus;
  assert.equal(await validator.areReferencesCurrent(refs()), false);
  user!.campus_id = campusId;
  assert.equal(await validator.areReferencesCurrent(refs()), true);
  campus!.activo = false;
  assert.equal(await validator.areReferencesCurrent(refs()), false);
});

test('actual map repository rejects unacknowledged inserts and updates with a campus filter', async () => {
  const { mongoClient } = await import('../src/database/mongodb/client.js');
  const repository = await import('../src/modules/maps/map.repository.js');
  const harness = mapHarness();
  let acknowledged = false;
  const db = {
    collection: (name: string) => {
      assert.equal(name, 'campus_maps');
      return {
        insertOne: async () => ({ acknowledged, insertedId: harness.mapId }),
        findOneAndUpdate: async (filter: Record<string, unknown>) => {
          assert.equal(filter.campusId, campusId);
          assert.equal(filter._id, harness.mapId);
          return null; // A concurrent deletion cannot be reported as a successful edit.
        },
        findOne: async () => harness.stored,
      };
    },
  } as unknown as Db;
  const stub = mock.method(mongoClient, 'db', () => db);
  try {
    const service = createMapService(repository, validator);
    await assert.rejects(service.createMap(harness.input), errorStatus(503));
    acknowledged = true;
    const created = await service.createMap(harness.input);
    assert.ok(created._id?.equals(harness.mapId));
    await assert.rejects(service.updateMap(harness.mapId, campusId, { status: 'ARCHIVED' }), errorStatus(404));
  } finally { stub.mock.restore(); }
});

test('existing map HTTP endpoint keeps data/404 contracts and sanitizes both dependency failures as 503', async () => {
  const { mongoClient } = await import('../src/database/mongodb/client.js');
  const { createApp } = await import('../src/app.js');
  const harness = mapHarness();
  let mongoFailure = false;
  const stub = mock.method(mongoClient, 'db', () => ({ collection: () => ({
    findOne: async () => {
      if (mongoFailure) throw new Error('mongodb://private-password');
      return harness.stored;
    },
  }) } as unknown as Db));
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/maps/${campusId}/active`;
  try {
    const ok = await originalFetch(url);
    assert.equal(ok.status, 200);
    const body = await ok.json() as { data: { campusId: string; _id: string; buildings: unknown[] } };
    assert.equal(body.data.campusId, campusId);
    assert.equal(body.data._id, harness.mapId.toHexString());
    assert.deepEqual(body.data.buildings, []);
    campus!.activo = false;
    assert.equal((await originalFetch(url)).status, 404);
    campus!.activo = true;
    for (const failing of ['mongodb', 'supabase']) {
      mongoFailure = failing === 'mongodb';
      failTable = failing === 'supabase' ? 'campus' : undefined;
      const response = await originalFetch(url);
      assert.equal(response.status, 503);
      const raw = await response.text();
      assert.equal(JSON.parse(raw).error.code, 'DEPENDENCY_UNAVAILABLE');
      assert.ok(!raw.includes('private') && !raw.includes('password'));
    }
  } finally {
    stub.mock.restore();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
