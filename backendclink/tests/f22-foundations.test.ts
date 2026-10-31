import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Db, MongoNetworkError, ObjectId } from 'mongodb';
import express, { type Express } from 'express';
import type { VerifiedAuthConnection } from '../src/modules/auth/types/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';

const campus = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const userId = '11111111-1111-4111-8111-111111111111';
const creator = '44444444-4444-4444-8444-444444444444';
const now = new Date('2099-10-10T12:00:00Z');
const auth = (): VerifiedAuthConnection => ({ userId, campusId: campus, roles: [], permissions: [], profile: {
  id: userId, campus_id: campus, institucion_id: campus, nombre_completo: 'Cuenta vigente', foto_path: null,
  verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
} });
const map: CampusMapDocument = { campusId: campus, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'h', name: 'Edificio H', floors: [{ id: 'h1', name: 'Piso 1', pois: [] }] }] };
const doc = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({ _id: new ObjectId(), campusId: campus,
  createdByUserId: creator, title: 'Actividad visible', description: 'Referencia relacional válida',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC', startAt: now,
  endAt: new Date('2099-10-11T12:00:00Z'), location: { buildingKey: 'h', floorKey: 'h1' },
  participantCount: 1, createdAt: now, updatedAt: now, ...patch });
const dependencies = { getActiveMap: async () => map, now: () => now };
const network = globalThis.fetch;
before(() => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://f22-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' });
});
after(async () => {
  globalThis.fetch = network;
  await (await import('../src/database/mongodb/client.js')).closeMongoDB();
});

async function withServer(app: Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run('http://127.0.0.1:' + (server.address() as AddressInfo).port); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('[F2.2-06] valid UUID references retain Mongo ObjectId; orphan/malformed/foreign references never enter the list', async () => {
  const { getActivities } = await import('../src/modules/activities/activities.service.js');
  const valid = doc(), missing = doc({ createdByUserId: other }); let calls = 0;
  const result = await getActivities(auth(), {}, { ...dependencies,
    findActivities: async () => [valid, missing, doc({ createdByUserId: 'not-a-uuid' }), doc({ campusId: other })],
    findValidCreators: async (at, ids) => { calls++; assert.equal(at, campus); assert.deepEqual(ids.sort(), [other, creator].sort());
      return new Map([[creator, 'Organizador']]); },
  });
  assert.equal(calls, 1); assert.deepEqual(result.map(row => row.id), [valid._id.toHexString()]);
  assert.ok(valid._id instanceof ObjectId); assert.equal(valid.createdByUserId, creator);
});

test('[F2.2-06] orphan detail and join return 404 without a participation write', async () => {
  const { getActivityDetail, joinActivity } = await import('../src/modules/activities/activities.detail.service.js');
  const value = doc(); let writes = 0, participationReads = 0;
  const deps = { ...dependencies, findActivity: async () => value, findValidCreators: async () => new Map<string, string>(),
    findParticipation: async () => { participationReads++; return null; }, registerParticipation: async () => { writes++; } };
  await assert.rejects(getActivityDetail(auth(), value._id.toHexString(), deps), { status: 404 });
  await assert.rejects(joinActivity(auth(), value._id.toHexString(), deps), { status: 404 });
  assert.equal(writes, 0); assert.equal(participationReads, 0);
});

test('[F2.2-06] orphan activities cannot receive new analytics interactions or reports by direct ID', async () => {
  const { recordViewedActivity } = await import('../src/modules/activities/activities.detail.service.js');
  const { reportActivity } = await import('../src/modules/reports/reports.service.js');
  const value = doc(); let writes = 0;
  const deps = { ...dependencies, findActivity: async () => value, findValidCreators: async () => new Map<string, string>(),
    recordView: async () => { writes++; }, saveActivityReport: async () => { writes++; throw Error('Must not save'); } };
  await assert.rejects(recordViewedActivity(auth(), value._id.toHexString(), crypto.randomUUID(), deps), { status: 404 });
  await assert.rejects(reportActivity(auth(), value._id.toHexString(), { reason: 'ACTIVITY_INAPPROPRIATE_CONTENT' }, deps), { status: 404 });
  assert.equal(writes, 0);
});

test('[F2.2-06] relational failure is 503 and never substitutes an empty success or partial Mongo write', async () => {
  const { joinActivity } = await import('../src/modules/activities/activities.detail.service.js');
  const value = doc(); let writes = 0;
  await assert.rejects(joinActivity(auth(), value._id.toHexString(), { ...dependencies, findActivity: async () => value,
    findValidCreators: async () => { throw new Error('secret PostgreSQL DSN'); },
    registerParticipation: async () => { writes++; },
  }), error => error instanceof Error && !error.message.includes('secret') && 'status' in error && error.status === 503);
  assert.equal(writes, 0);
});

test('[F2.2-06] actual reference repository checks active state/campus/deletion and batches repeated creators', async () => {
  const { findValidActivityCreators } = await import('../src/modules/activities/activities.references.repository.js');
  const urls: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); urls.push(url);
    assert.equal(url.searchParams.get('campus_id'), 'eq.' + campus);
    assert.equal(url.searchParams.get('estado_cuenta'), 'eq.ACTIVA');
    assert.equal(url.searchParams.get('deleted_at'), 'is.null');
    assert.equal(url.searchParams.get('select'), 'id,nombre_completo');
    return Response.json([{ id: creator, nombre_completo: ' Organizador ' }]);
  };
  try {
    assert.equal((await findValidActivityCreators(campus, [creator, other])).get(creator), 'Organizador');
    assert.equal(urls.length, 1);
    globalThis.fetch = async () => { throw Error('private credentials'); };
    await assert.rejects(findValidActivityCreators(campus, [creator]), { status: 503 });
  } finally { globalThis.fetch = network; }
});

test('[F2.2-06] creator reference changes hide the next list and detail read without caching or deleting history', async () => {
  const { getActivities } = await import('../src/modules/activities/activities.service.js');
  const { getActivityDetail } = await import('../src/modules/activities/activities.detail.service.js');
  const value = doc(); const original = JSON.stringify(value); let current = true, reads = 0;
  const deps = { ...dependencies, findActivity: async () => value, findActivities: async () => [value],
    findValidCreators: async () => { reads++; return current ? new Map([[creator, 'Organizador']]) : new Map<string, string>(); } };
  assert.equal((await getActivities(auth(), {}, deps)).length, 1);
  current = false; // El repositorio relacional deja de admitir la referencia tras traslado o inactividad.
  assert.deepEqual(await getActivities(auth(), {}, deps), []);
  await assert.rejects(getActivityDetail(auth(), value._id.toHexString(), deps), { status: 404 });
  assert.equal(reads, 3); assert.equal(JSON.stringify(value), original);
});

test('[F2.2-06] inactive relational campus blocks Mongo reads and provider failures remain unavailable', async () => {
  const { getActiveMap } = await import('../src/modules/maps/map.service.js'); let reads = 0;
  const collection = mock.method(Db.prototype, 'collection', () => ({ findOne: async () => { reads++; return map; } }));
  globalThis.fetch = async () => Response.json([]);
  try {
    assert.equal(await getActiveMap(campus), null); assert.equal(reads, 0);
    globalThis.fetch = async () => Response.json({ message: 'private query' }, { status: 500 });
    await assert.rejects(getActiveMap(campus), { status: 503 }); assert.equal(reads, 0);
  } finally { collection.mock.restore(); globalThis.fetch = network; }
});

test('[F2.2-06] Mongo outage uses sanitized HTTP 503 without a false successful acknowledgement', async () => {
  const { apiErrorHandler } = await import('../src/shared/http/error-handler.js');
  const app = express(); app.get('/', () => { throw new MongoNetworkError('mongodb://private:password@host'); }); app.use(apiErrorHandler);
  await withServer(app, async base => {
    const response = await network(base); assert.equal(response.status, 503);
    const text = await response.text(); assert.ok(text.includes('DEPENDENCY_UNAVAILABLE')); assert.ok(!text.includes('password'));
  });
});

test('[F2.2-07] mismatched server campus cannot read a map even with an administrative grant', async () => {
  const { getAuthorizedActiveMap } = await import('../src/modules/maps/map.service.js'); let reads = 0;
  const context = auth(); context.profile.campus_id = other; context.roles = [{ id: creator, name: 'ADMINISTRADOR', campusId: campus }];
  await assert.rejects(getAuthorizedActiveMap(context, campus, async () => { reads++; return map; }), { status: 403 });
  assert.equal(reads, 0);
});

test('[F2.2-07] the same token immediately follows a changed PostgreSQL campus and rejects the previous route', async () => {
  const { createApp } = await import('../src/app.js'); let current = campus; const reads: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'qa@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([{ ...auth().profile, campus_id: current }]);
    return Response.json([]);
  };
  try { await withServer(createApp({ getActiveMap: async id => { reads.push(id); return { ...map, campusId: id }; } }), async base => {
    const headers = { Authorization: 'Bearer unchanged.valid.token' };
    const request = (id: string) => network(base + '/api/v1/maps/' + id + '/active', { headers });
    assert.equal((await request(campus)).status, 200);
    current = other;
    assert.equal((await request(campus)).status, 403);
    const response = await request(other); assert.equal(response.status, 200);
    assert.equal((await response.json()).data.campusId, other);
    assert.deepEqual(reads, [campus, other]);
  }); } finally { globalThis.fetch = network; }
});

test('[F2.2-08] operational activity reads omit retired content without mutating its history or participations', async () => {
  const { getActivities } = await import('../src/modules/activities/activities.service.js');
  const documents = [doc({ createdByUserId: userId }), doc({ deletedAt: now }), doc({ status: 'DELETED' }), doc({ visibility: 'HIDDEN' })];
  const original = structuredClone(documents.map(row => ({ ...row, _id: row._id.toHexString() })));
  const result = await getActivities(auth(), {}, { ...dependencies, findActivities: async () => documents });
  assert.deepEqual(result.map(row => row.id), [documents[0]._id.toHexString()]);
  assert.deepEqual(documents.map(row => ({ ...row, _id: row._id.toHexString() })), original);
});

test('[F2.2-10] endpoint without a policy denies 401/403 before executing its controller, including route().get', async () => {
  const { createPolicyRouter, publicEndpoint } = await import('../src/shared/http/endpoint-policy.js');
  const { apiErrorHandler } = await import('../src/shared/http/error-handler.js');
  const router = createPolicyRouter(); let executions = 0;
  const { requireAuthentication } = await import('../src/modules/auth/middleware/auth.middleware.js');
  router.get('/forgotten', (_request, response) => { executions++; response.json({ leaked: true }); });
  router.route('/chained').get((_request, response) => { executions++; response.json({ leaked: true }); });
  router.get('/misordered', (_request, response) => { executions++; response.json({ leaked: true }); }, requireAuthentication);
  router.route('/all').all((_request, response) => { executions++; response.json({ leaked: true }); });
  router.get('/public', publicEndpoint, (_request, response) => response.json({ public: true }));
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'qa@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth().profile]);
    return Response.json([]);
  };
  const app = express(); app.use(router); app.use(apiErrorHandler);
  try { await withServer(app, async base => {
    for (const path of ['/forgotten', '/chained', '/misordered', '/all']) {
      assert.equal((await network(base + path)).status, 401);
      assert.equal((await network(base + path, { headers: { Authorization: 'Bearer valid.test.token' } })).status, 403);
    }
    assert.equal((await network(base + '/public')).status, 200); assert.equal(executions, 0);
  }); } finally { globalThis.fetch = network; }
});

test('[F2.2-10] every mounted endpoint explicitly declares public, verified identity or current account policy', async () => {
  const { createApiRouter } = await import('../src/routes/index.js');
  const { publicEndpoint } = await import('../src/shared/http/endpoint-policy.js');
  const { requireAuthentication, requireVerifiedIdentity } = await import('../src/modules/auth/middleware/auth.middleware.js');
  let total = 0;
  function inspect(router: ReturnType<typeof createApiRouter>) {
    for (const layer of router.stack) {
      if (layer.route) {
        total++;
        assert.ok(layer.route.stack.some((entry: { handle: unknown }) =>
          [publicEndpoint, requireAuthentication, requireVerifiedIdentity].includes(entry.handle as typeof publicEndpoint)), layer.route.path);
        assert.ok(!layer.route.stack.some((entry: { handle: { name: string } }) => entry.handle.name === 'denyUndefinedPolicy'), layer.route.path);
      } else if (layer.handle.stack) inspect(layer.handle);
    }
  }
  inspect(createApiRouter()); assert.ok(total > 100, String(total));
});
