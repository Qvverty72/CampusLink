import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, MongoClient } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivityParticipationDocument, CreateActivityInput } from '../src/modules/activities/activities.types.js';
import type { ActivityDependencies } from '../src/modules/activities/activities.service.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { parseCreateActivity } from '../src/modules/activities/activities.create.validation.js';
import { spatialBuildings } from '../src/modules/activities/activities.location.js';
import { toVisibleActivity } from '../src/modules/activities/activities.policy.js';

const campusId = '22222222-2222-4222-8222-222222222222';
const otherCampus = '33333333-3333-4333-8333-333333333333';
const userId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2099-10-10T12:00:00Z');
const assignment = (name: string, campus = campusId) => ({ id: name, name, campusId: campus });
const context = (): VerifiedAuthConnection => ({ userId, campusId,
  roles: [assignment('USUARIO_AUTORIZADO')], permissions: [assignment('PUBLICAR_EVENTO')],
  profile: { id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Organizador oficial', foto_path: null,
    verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null },
});
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'hbuilding', name: 'Edificio H', floors: [
    { id: 'floor-two', name: 'Piso 2', meshName: 'hbuilding_floor2', pois: [
      { poiKey: 'sala', name: 'Sala de reuniones', isVisible: true },
      { poiKey: 'hidden', name: 'Oculto', isVisible: false },
      { poiKey: 'deleted', name: 'Eliminado', isVisible: true, deletedAt: now },
    ] }, { id: 'floor-one', name: 'Piso 1', meshName: 'hbuilding_floor1', pois: [{ poiKey: 'other-floor', name: 'Otro piso', isVisible: true }] },
  ] }] };
const body = () => ({ title: 'Seminario oficial', description: 'Evento presencial del campus',
  startAt: '2099-10-11T12:00:00.000Z', endAt: '2099-10-11T14:00:00.000Z',
  location: { buildingKey: 'hbuilding', floorKey: 'floor-two' },
});
function parsed(input: unknown = body()): CreateActivityInput {
  const result = parseCreateActivity(input); assert.equal(result.success, true);
  return (result as { data: CreateActivityInput }).data;
}
const dependencies = (persist: (value: ActivityDocument) => void): ActivityDependencies => ({
  getActiveMap: async () => map, now: () => now, createActivity: async document => {
    persist(document); return toVisibleActivity(document, campusId, now, spatialBuildings(map))!;
  },
});
let createOfficialEvent: typeof import('../src/modules/activities/activities.create.service.js').createOfficialEvent;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://official-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  ({ createOfficialEvent } = await import('../src/modules/activities/activities.create.service.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('official publication requires authorized role AND local permission; other capabilities or foreign grants do not imply it', async () => {
  let writes = 0;
  for (const [roles, permissions] of [
    [[], []], [[assignment('USUARIO_AUTORIZADO')], []], [[], [assignment('PUBLICAR_EVENTO')]],
    [[assignment('USUARIO_AUTORIZADO')], [assignment('ACCEDER_ANALITICA'), assignment('ACCEDER_REPORTERIA')]],
    [[assignment('USUARIO_AUTORIZADO', otherCampus)], [assignment('PUBLICAR_EVENTO')]],
    [[assignment('USUARIO_AUTORIZADO')], [assignment('PUBLICAR_EVENTO', otherCampus)]],
  ]) {
    await assert.rejects(createOfficialEvent({ ...context(), roles, permissions }, parsed(), dependencies(() => writes++)), { status: 403 });
  }
  assert.equal(writes, 0);
  const result = await createOfficialEvent(context(), parsed(), dependencies(() => writes++));
  assert.equal(result.type, 'OFFICIAL_EVENT'); assert.equal(writes, 1);
});

test('approved administrator exception grants automatic local publication, without creating permission or foreign-campus access', async () => {
  const admin = { ...context(), roles: [assignment('ADMINISTRADOR')], permissions: [] };
  let writes = 0;
  const detail = await createOfficialEvent(admin, parsed(), dependencies(() => writes++));
  assert.equal(detail.campusId, campusId); assert.equal(detail.type, 'OFFICIAL_EVENT'); assert.equal(writes, 1);
  assert.deepEqual(admin.permissions, []);
  await assert.rejects(createOfficialEvent({ ...admin, roles: [assignment('ADMINISTRADOR', otherCampus)] }, parsed(), dependencies(() => writes++)), { status: 403 });
  assert.equal(writes, 1);
});

test('official type and identity are server-owned, organizer comes from profile, and creator is participant from creation', async () => {
  const auth = context(); auth.profile.verificado_en = null;
  const detail = await createOfficialEvent(auth, parsed({ ...body(), location: { ...body().location, poiKey: 'sala' } }), dependencies(document => {
    assert.equal(document.type, 'OFFICIAL_EVENT'); assert.equal(document.status, 'ACTIVE'); assert.equal(document.visibility, 'PUBLIC');
    assert.equal(document.createdByUserId, userId); assert.equal(document.campusId, campusId); assert.equal(document.participantCount, 1);
    assert.equal(document.createdAt, now); assert.equal(document.updatedAt, now);
    assert.equal(document.location.floorKey, 'floor-two'); assert.equal('organizer' in document, false);
  }));
  assert.deepEqual(detail.organizer, { name: 'Organizador oficial' });
  assert.deepEqual(detail.participation, { status: 'JOINED', canJoin: false }); assert.equal(detail.location.poiName, 'Sala de reuniones');
  // Institutional verification is required for COMMUNITY; official publication follows its specific role/permission.
  for (const key of ['type', 'campusId', 'createdByUserId', 'organizer', 'organizerId', 'participantCount', 'roles', 'permissions']) {
    assert.equal(parseCreateActivity({ ...body(), [key]: 'override' }).success, false);
  }
});

test('official publication denies inactive accounts and invalid locations/dates before any write', async () => {
  let writes = 0; const deps = dependencies(() => writes++);
  for (const profile of [{ estado_cuenta: 'SUSPENDIDA' as const }, { estado_cuenta: 'DESACTIVADA' as const },
    { deleted_at: now.toISOString() }, { campus_id: otherCampus }, { id: otherCampus }]) {
    const auth = context(); await assert.rejects(createOfficialEvent({ ...auth, profile: { ...auth.profile, ...profile } }, parsed(), deps), { status: 403 });
  }
  for (const location of [{ buildingKey: 'foreign', floorKey: 'floor-two' }, { buildingKey: 'hbuilding', floorKey: 'hbuilding_floor2' },
    ...['hidden', 'deleted', 'other-floor'].map(poiKey => ({ ...body().location, poiKey }))]) {
    await assert.rejects(createOfficialEvent(context(), parsed({ ...body(), location }), deps), { status: 400 });
  }
  await assert.rejects(createOfficialEvent(context(), parsed(), { ...deps, getActiveMap: async () => ({ ...map, campusId: otherCampus }) }), { status: 404 });
  await assert.rejects(createOfficialEvent(context(), parsed({ ...body(), startAt: '2099-10-09T12:00:00.000Z', endAt: now.toISOString() }), deps), { status: 400 });
  assert.equal(writes, 0);
});

test('official organizer must be resolvable from the current profile, without client-supplied name', async () => {
  const auth = context(); auth.profile.nombre_completo = '   '; let writes = 0;
  await assert.rejects(createOfficialEvent(auth, parsed(), dependencies(() => writes++)), { status: 503 });
  assert.equal(writes, 0);
});

test('official transaction commits type/count/creator JOINED together and aborts failed participation or unavailable location', async () => {
  let staged: { name: string; document: ActivityDocument | ActivityParticipationDocument }[] = [];
  const committed: typeof staged = []; let fail = false; let activeMap = map;
  const session = { withTransaction: async (operation: () => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    staged = []; try { const result = await operation(); committed.push(...staged); return result; } finally { staged = []; }
  } };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: (value: typeof session) => Promise<unknown>) => operation(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({
    indexes: async () => [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOne: async (filter: unknown, options: { session: unknown }) => {
      assert.equal(name, 'campus_maps'); assert.equal(options.session, session);
      assert.deepEqual(filter, { campusId, status: 'ACTIVE' }); return activeMap;
    },
    insertOne: async (document: ActivityDocument | ActivityParticipationDocument, options: { session: unknown }) => {
      assert.equal(options.session, session);
      if (fail && name === 'activity_participation') throw new Error('Creator enrollment failed');
      staged.push({ name, document });
    },
  }));
  try {
    const deps = { getActiveMap: async () => map, now: () => now };
    const detail = await createOfficialEvent(context(), parsed(), deps);
    assert.equal(committed.length, 2);
    const activity = committed[0].document as ActivityDocument; const own = committed[1].document as ActivityParticipationDocument;
    assert.equal(activity.type, 'OFFICIAL_EVENT'); assert.equal(activity.participantCount, 1); assert.equal(activity._id.toHexString(), detail.id);
    assert.deepEqual(own.activityId, activity._id); assert.equal(own.userId, userId); assert.equal(own.campusId, campusId);
    assert.equal(own.status, 'JOINED'); assert.deepEqual(own.joinedAt, activity.createdAt);
    fail = true; await assert.rejects(createOfficialEvent(context(), parsed(), deps), /Creator enrollment failed/);
    assert.equal(committed.length, 2); assert.equal(staged.length, 0);
    activeMap = { ...map, buildings: [] }; await assert.rejects(createOfficialEvent(context(), parsed(), deps), { status: 400 });
    assert.equal(committed.length, 2);
  } finally { dbMock.mock.restore(); sessionMock.mock.restore(); }
});

test('HTTP official flow enforces fresh permissions, returns official list/detail, preserves community type and registers only the creator', async () => {
  const originalFetch = globalThis.fetch; let auth = context(); const documents: ActivityDocument[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'official@test.invalid', email_confirmed_at: now.toISOString(),
      user_metadata: { roles: ['ADMINISTRADOR'], permissions: ['PUBLICAR_EVENTO'], campusId: otherCampus } });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    if (url.pathname.endsWith('/usuario_rol')) return Response.json(auth.roles.map(role => ({ campus_id: role.campusId, rol: { id: role.id, nombre: role.name } })));
    if (url.pathname.endsWith('/usuario_permiso')) return Response.json(auth.permissions.map(permission => ({ campus_id: permission.campusId, permiso: { id: permission.id, nombre: permission.name } })));
    throw new Error('Unexpected auth request');
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json()); app.use('/api/v1/activities', createActivitiesRouter({
    ...dependencies(document => documents.push(document)), findActivities: async () => documents,
    findActivity: async (campus, id) => documents.find(document => document.campusId === campus && document._id.toHexString() === id) ?? null,
    findParticipation: async (campus, id, user) => ({ campusId: campus, activityId: documents.find(document => document._id.toHexString() === id)!._id,
      userId: user, status: 'JOINED', joinedAt: now, updatedAt: now }),
  })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities`;
  const headers = { Authorization: 'Bearer official.test.token', 'Content-Type': 'application/json' };
  const publish = (payload: unknown = body(), suffix = '/official') => originalFetch(base + suffix, { method: 'POST', headers, body: JSON.stringify(payload) });
  try {
    assert.equal((await originalFetch(base + '/official', { method: 'POST' })).status, 401);
    auth.roles = []; auth.permissions = []; assert.equal((await publish()).status, 403);
    auth = context(); auth.permissions = []; assert.equal((await publish()).status, 403);
    auth.permissions = [assignment('PUBLICAR_EVENTO', otherCampus)]; assert.equal((await publish()).status, 403);
    auth = context();
    for (const key of ['campusId', 'type', 'organizer', 'createdByUserId']) assert.equal((await publish({ ...body(), [key]: 'override' })).status, 400);
    assert.equal((await publish(body(), '/official?campusId=' + otherCampus)).status, 400);
    assert.equal(documents.length, 0);
    const response = await publish(); assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    const official = (await response.json()).data;
    assert.equal(official.type, 'OFFICIAL_EVENT'); assert.equal(official.campusId, campusId);
    assert.deepEqual(official.organizer, { name: 'Organizador oficial' }); assert.deepEqual(official.participation, { status: 'JOINED', canJoin: false });
    const list = (await (await originalFetch(base, { headers })).json()).data;
    assert.equal(list[0].type, 'OFFICIAL_EVENT'); assert.equal(list[0].id, official.id);
    const detail = (await (await originalFetch(base + '/' + official.id, { headers })).json()).data;
    assert.equal(detail.type, 'OFFICIAL_EVENT'); assert.equal(detail.location.floorKey, 'floor-two'); assert.equal(detail.participation.status, 'JOINED');
    auth.permissions = []; assert.equal((await publish()).status, 403); assert.equal(documents.length, 1);
    const communityResponse = await publish(body(), ''); assert.equal(communityResponse.status, 201);
    assert.equal((await communityResponse.json()).data.type, 'COMMUNITY_ACTIVITY'); assert.equal(documents.length, 2);
    auth.roles = [assignment('ADMINISTRADOR')]; const adminResponse = await publish(); assert.equal(adminResponse.status, 201);
    assert.equal((await adminResponse.json()).data.type, 'OFFICIAL_EVENT'); assert.equal(documents.length, 3);
    auth.roles = []; assert.equal((await publish()).status, 403); assert.equal(documents.length, 3);
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
