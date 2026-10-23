import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { Db, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument } from '../src/modules/activities/activities.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { filterLocationActivities, selectActivityOccurrences, type Activity } from '../../frontendclink/src/features/activities/types/activity.js';
import { parseActivityQuery } from '../src/modules/activities/activities.validation.js';

test('activity filters require a complete hierarchy and reject campus/policy overrides', () => {
  assert.equal(parseActivityQuery({}).success, true);
  assert.equal(parseActivityQuery({ buildingKey: 'cabin01' }).success, true);
  assert.equal(parseActivityQuery({ buildingKey: 'cabin01', floorKey: 'cabin01_floor1', poiKey: 'sala' }).success, true);
  for (const query of [
    { campusId: 'another-campus' }, { status: 'HIDDEN' }, { visibility: 'PRIVATE' },
    { floorKey: 'cabin01_floor1' }, { buildingKey: 'cabin01', poiKey: 'sala' },
    { buildingKey: ['cabin01', 'cabin02'] }, { buildingKey: { $ne: '' } },
    { buildingKey: '../maps' }, { buildingKey: '' },
  ]) assert.equal(parseActivityQuery(query).success, false);
});

const campusId = '22222222-2222-4222-8222-222222222222';
const otherCampus = '33333333-3333-4333-8333-333333333333';
const userId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-10-10T12:00:00Z');
const auth: VerifiedAuthConnection = {
  userId, campusId, roles: [], permissions: [], profile: {
    id: userId, campus_id: campusId, institucion_id: campusId, nombre_completo: 'Test', foto_path: null,
    verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null,
  },
};
const map: CampusMapDocument = {
  campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
  buildings: [{ id: 'cabin01', name: 'Cabaña 1', floors: [
    { id: 'floor-data-1', meshName: 'cabin01_floor1', name: 'Primer piso', pois: [
      { poiKey: 'sala', name: 'Sala', isVisible: true },
      { poiKey: 'hidden', name: 'Oculto', isVisible: false },
      { poiKey: 'deleted', name: 'Retirado', isVisible: true, deletedAt: now },
    ] },
    { id: 'floor-data-2', meshName: 'cabin01_floor2', name: 'Segundo piso', pois: [] },
  ] }],
};
const document = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({
  _id: new ObjectId(), campusId, createdByUserId: userId, title: 'Actividad', description: 'Descripción',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2026-10-11T12:00:00Z'), endAt: new Date('2026-10-11T13:00:00Z'),
  location: { buildingKey: 'cabin01', floorKey: 'floor-data-1' },
  participantCount: 1, createdAt: now, updatedAt: now, ...patch,
});
let getActivities: typeof import('../src/modules/activities/activities.service.js').getActivities;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017',
    SUPABASE_URL: 'https://activities-test.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' });
  getActivities = (await import('../src/modules/activities/activities.service.js')).getActivities;
});
after(async () => {
  const { closeMongoDB } = await import('../src/database/mongodb/client.js');
  await closeMongoDB();
});

const dependencies = (documents: ActivityDocument[]) => ({ getActiveMap: async () => map,
  findActivities: async (campus: string) => { assert.equal(campus, campusId); return documents; }, now: () => now });

test('personal activity reads are server-scoped, paginated after validation and omit restricted series metadata', async () => {
  const { getOwnActivities, joinedActivitiesPipeline } = await import('../src/modules/activities/activities.mine.service.js');
  const first = document(), second = document({ seriesId: new ObjectId(), occurrenceIndex: 1, occurrenceCount: 2, originalStartAt: now });
  let reads = 0;
  const deps = { ...dependencies([]), findJoinedActivities: async (campus: string, user: string) => {
    reads++; assert.equal(campus, campusId); assert.equal(user, userId);
    return [second, document({ status: 'HIDDEN' }), document({ campusId: otherCampus }), document({ endAt: now }), first];
  } };
  const result = await getOwnActivities(auth, { limit: '1', page: '2' }, deps);
  assert.equal(result.total, 2); assert.equal(result.items.length, 1); assert.equal(result.hasMore, false);
  assert.equal(result.items[0].series, undefined); assert.equal('createdByUserId' in result.items[0], false);
  for (const query of [{ userId }, { campusId: otherCampus }, { status: 'LEFT' }, { page: '-1' }, { limit: '101' }, { page: ['1'] }]) {
    await assert.rejects(getOwnActivities(auth, query, deps), { status: 400 });
  }
  assert.equal(reads, 1);
  await assert.rejects(getOwnActivities({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } }, {}, deps), { status: 403 });
  assert.equal(reads, 1);
  const pipeline = joinedActivitiesPipeline(campusId, userId, now);
  assert.equal(pipeline[0].$match!.campusId, campusId);
  const lookup = pipeline[1].$lookup!;
  assert.equal(lookup.from, 'activity_participation');
  assert.deepEqual(lookup.pipeline[0].$match, { campusId, userId, $expr: { $eq: ['$activityId', '$$activityId'] } });
  assert.deepEqual(pipeline[2].$match!.$or, [{ 'ownParticipation.status': 'JOINED' }, { createdByUserId: userId, ownParticipation: { $size: 0 } }]);
});

test('future and ongoing activities use data IDs, support a floor without a POI and serialize dates', async () => {
  const future = document();
  const ongoing = document({ type: 'OFFICIAL_EVENT', startAt: new Date('2026-10-10T11:00:00Z'), endAt: new Date('2026-10-10T13:00:00Z'),
    location: { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'sala' } });
  const result = await getActivities(auth, { buildingKey: 'cabin01', floorKey: 'floor-data-1' }, dependencies([future, ongoing]));
  assert.deepEqual(result.map(value => value.type), ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY']);
  assert.equal(result[0].location.poiName, 'Sala');
  assert.equal(result[1].location.poiKey, undefined);
  assert.equal(result[1].startAt, future.startAt.toISOString());
  assert.equal('createdByUserId' in result[0], false);
  await assert.rejects(getActivities(auth, { buildingKey: 'cabin01', floorKey: 'cabin01_floor1' }, dependencies([])), { status: 404 });
});

test('public consultation excludes foreign campus, hidden/private/cancelled/ended and malformed activities', async () => {
  const invalid = [document({ campusId: otherCampus }), document({ status: 'HIDDEN' }), document({ status: 'CANCELLED' }),
    document({ visibility: 'PRIVATE' }), document({ type: 'OTHER' }), document({ endAt: now }),
    document({ endAt: new Date('2026-10-09') }), document({ startAt: new Date('invalid') }),
    document({ startAt: new Date('2026-10-12') }), document({ location: { buildingKey: 'missing', floorKey: 'floor-data-1' } }),
    document({ location: { buildingKey: 'cabin01', floorKey: 'missing' } }),
    document({ location: { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'hidden' } }),
    document({ location: { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'deleted' } }),
    document({ location: { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'missing' } }),
  ];
  const direct = document();
  const result = await getActivities(auth, {}, dependencies([...invalid, direct]));
  assert.deepEqual(result.map(value => value.id), [direct._id.toHexString()]);
});

test('floor/POI filters do not include siblings, and unknown locations fail before reading activities', async () => {
  const first = document();
  const second = document({ location: { buildingKey: 'cabin01', floorKey: 'floor-data-2' } });
  const poi = document({ location: { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'sala' } });
  assert.equal((await getActivities(auth, { buildingKey: 'cabin01' }, dependencies([first, second, poi]))).length, 3);
  assert.equal((await getActivities(auth, { buildingKey: 'cabin01', floorKey: 'floor-data-1' }, dependencies([first, second, poi]))).length, 2);
  assert.deepEqual((await getActivities(auth, { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'sala' }, dependencies([first, second, poi]))).map(value => value.id), [poi._id.toHexString()]);
  let reads = 0;
  await assert.rejects(getActivities(auth, { buildingKey: 'missing' }, { ...dependencies([]), findActivities: async () => { reads++; return []; } }), { status: 404 });
  assert.equal(reads, 0);
});

test('suspended or unverified accounts and foreign active-map documents cannot reach the activity repository', async () => {
  let reads = 0;
  const deps = { ...dependencies([]), findActivities: async () => { reads++; return []; } };
  await assert.rejects(getActivities({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } }, {}, deps), { status: 403 });
  await assert.rejects(getActivities({ ...auth, profile: { ...auth.profile, verificado_en: null } }, {}, deps), { status: 403 });
  await assert.rejects(getActivities(auth, {}, { ...deps, getActiveMap: async () => ({ ...map, campusId: otherCampus }) }), { status: 404 });
  assert.equal(reads, 0);
});

test('repository pushes campus, publication, visibility, expiry and spatial filters into Mongo', async () => {
  const captured: unknown[] = [];
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => {
    assert.equal(name, 'activities');
    return { find: (filter: unknown, options: unknown) => { captured.push(filter, options); return {
      sort: (sort: unknown) => { assert.deepEqual(sort, { startAt: 1, _id: 1 }); return { toArray: async () => [] }; },
    }; } };
  });
  try {
    const { findVisibleActivities } = await import('../src/modules/activities/activities.repository.js');
    await findVisibleActivities(campusId, { buildingKey: 'cabin01', floorKey: 'floor-data-1', poiKey: 'sala' }, now);
    assert.deepEqual(captured[0], { campusId, status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null,
      type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] }, endAt: { $gt: now },
      'location.buildingKey': 'cabin01', 'location.floorKey': 'floor-data-1', 'location.poiKey': 'sala' });
  } finally { dbMock.mock.restore(); }
});

test('HTTP route rejects missing identity and filter overrides, returns an envelope and no-store data', async () => {
  const originalFetch = globalThis.fetch;
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js');
  const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://activities-test.invalid');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer activities.test.token');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]);
    return Response.json([]);
  };
  const app = express();
  app.use('/api/v1/activities', createActivitiesRouter({ ...dependencies([document()]),
    findJoinedActivities: async (campus, user) => { assert.equal(campus, campusId); assert.equal(user, userId); return [document()]; },
    findActivities: async () => { reads++; return [document()]; } }));
  app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities`;
  const headers = { Authorization: 'Bearer activities.test.token' };
  try {
    assert.equal((await originalFetch(url)).status, 401); assert.equal(reads, 0);
    assert.equal((await originalFetch(url + '?campusId=' + otherCampus, { headers })).status, 400); assert.equal(reads, 0);
    const response = await originalFetch(url + '?buildingKey=cabin01&floorKey=floor-data-1', { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.equal(body.data.length, 1); assert.equal(body.data[0].campusId, campusId);
    assert.equal(reads, 1);
    assert.equal((await originalFetch(url + '/mine')).status, 401);
    assert.equal((await originalFetch(url + '/mine/count')).status, 401);
    assert.equal((await originalFetch(url + '/mine?userId=' + userId, { headers })).status, 400);
    const mine = await originalFetch(url + '/mine?limit=1', { headers });
    assert.equal(mine.status, 200); assert.equal(mine.headers.get('cache-control'), 'no-store');
    assert.equal((await mine.json()).data.items.length, 1);
    const total = await originalFetch(url + '/mine/count', { headers });
    assert.deepEqual((await total.json()).data, { campusId, total: 1 });
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('frontend location selection excludes sibling floors and activities expiring at the boundary', () => {
  const first = { id: 'one', endAt: '2026-10-10T13:00:00Z', location: { buildingKey: 'cabin01', floorKey: 'floor-data-1' } } as Activity;
  const sibling = { ...first, id: 'two', location: { buildingKey: 'cabin01', floorKey: 'floor-data-2' } } as Activity;
  const ended = { ...first, id: 'ended', endAt: now.toISOString() };
  assert.deepEqual(filterLocationActivities([first, sibling, ended], { buildingKey: 'cabin01', floorKey: 'floor-data-1' }, now.getTime()).map(value => value.id), ['one']);
});

const occurrence = (index: number, seriesId = 'series-a'): Activity => ({
  id: `${seriesId}-${index}`, campusId, title: 'Mismo título', description: 'Reunión',
  type: 'OFFICIAL_EVENT', status: 'ACTIVE',
  startAt: `2026-10-${String(11 + index).padStart(2, '0')}T14:00:00Z`,
  endAt: `2026-10-${String(11 + index).padStart(2, '0')}T15:00:00Z`,
  series: { id: seriesId, index, total: 10 },
  location: { buildingKey: 'cabin01', buildingName: 'Cabaña A', floorKey: 'floor-1', floorName: 'Piso 1' },
});

test('frontend lists one real occurrence per series and advances at its exact end, including gaps and completion', () => {
  const dates = Array.from({ length: 10 }, (_, index) => occurrence(index + 1));
  const original = structuredClone(dates);
  const idsAt = (time: string) => selectActivityOccurrences([...dates].reverse(), Date.parse(time)).map(value => value.id);
  assert.deepEqual(idsAt('2026-10-12T13:00:00Z'), ['series-a-1']);
  assert.deepEqual(idsAt('2026-10-12T14:30:00Z'), ['series-a-1']);
  assert.deepEqual(idsAt('2026-10-12T15:00:00Z'), ['series-a-2']);
  assert.deepEqual(idsAt('2026-10-13T13:00:00Z'), ['series-a-2']);
  assert.deepEqual(idsAt('2026-10-21T14:30:00Z'), ['series-a-10']);
  assert.deepEqual(idsAt('2026-10-21T15:00:00Z'), []);
  const selected = selectActivityOccurrences(dates, Date.parse('2026-10-12T15:00:00Z'))[0];
  assert.equal(selected, dates[1]);
  assert.deepEqual(selected.series, { id: 'series-a', index: 2, total: 10 });
  assert.deepEqual(dates, original);
});

test('frontend picks series representatives before location filters and sorts by edited dates without merging titles', () => {
  const first = occurrence(1);
  const second = { ...occurrence(2), location: { ...first.location, floorKey: 'floor-2', poiKey: 'room-b' } };
  const independent = { ...occurrence(1), id: 'individual', series: undefined };
  const anotherSeries = occurrence(1, 'series-b');
  const activities = [second, anotherSeries, independent, first];
  const before = selectActivityOccurrences(activities, Date.parse('2026-10-12T14:30:00Z'));
  assert.equal(before.length, 3);
  assert.equal(filterLocationActivities(before, { floorKey: 'floor-2' }, Date.parse('2026-10-12T14:30:00Z')).length, 0);
  const after = selectActivityOccurrences(activities, Date.parse(first.endAt));
  assert.deepEqual(filterLocationActivities(after, { floorKey: 'floor-1' }, Date.parse(first.endAt)), []);
  assert.deepEqual(filterLocationActivities(after, { floorKey: 'floor-2', poiKey: 'room-b' }, Date.parse(first.endAt)).map(value => value.id), [second.id]);
  const edited = { ...second, startAt: '2026-10-12T12:00:00Z', endAt: '2026-10-12T16:00:00Z' };
  assert.equal(selectActivityOccurrences([first, edited], Date.parse('2026-10-12T14:30:00Z'))[0].id, edited.id);
});

test('frontend keeps the earliest ongoing occurrence during overlaps and resolves tied starts deterministically', () => {
  const first = { ...occurrence(1), endAt: '2026-10-13T15:00:00Z' };
  const second = { ...occurrence(2), endAt: '2026-10-13T16:00:00Z' };
  assert.equal(selectActivityOccurrences([second, first], Date.parse('2026-10-13T14:30:00Z'))[0].id, first.id);
  assert.equal(selectActivityOccurrences([second, first], Date.parse(first.endAt))[0].id, second.id);
  const tied = { ...second, startAt: first.startAt };
  assert.equal(selectActivityOccurrences([tied, first], Date.parse('2026-10-12T14:30:00Z'))[0].id, first.id);
  assert.deepEqual(selectActivityOccurrences([{ ...first, startAt: 'invalid' }, { ...second, endAt: second.startAt }]), []);
});
