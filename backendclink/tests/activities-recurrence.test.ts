import assert from 'node:assert/strict';
import { before, after, mock, test } from 'node:test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expandActivityRecurrence } from '../src/modules/activities/activities.recurrence.js';
import { activitySeriesParser } from '../src/modules/activities/activities.series.validation.js';
import { spatialBuildings } from '../src/modules/activities/activities.location.js';
import { toVisibleActivity } from '../src/modules/activities/activities.policy.js';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivitySeriesDocument, CreateActivitySeriesInput, ActivityParticipationDocument } from '../src/modules/activities/activities.types.js';
import type { ActivityDependencies } from '../src/modules/activities/activities.service.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { recurrenceDraftRule } from '../../frontendclink/src/features/activities/types/recurrence.js';

const campusId = '22222222-2222-4222-8222-222222222222', userId = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333'; const now = new Date('2099-01-01T00:00:00Z');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: { id: userId, campus_id: campusId,
  institucion_id: campusId, nombre_completo: 'Organizador', foto_path: null, verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null } };
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now, buildings: [
  { id: 'hbuilding', name: 'Edificio H', floors: [{ id: 'floor-two', meshName: 'hbuilding_floor2', name: 'Piso 2', pois: [
    { poiKey: 'sala', name: 'Sala', isVisible: true }, { poiKey: 'hidden', name: 'Oculto', isVisible: false },
  ] }] },
] };
const body = () => ({ title: 'Taller recurrente', description: 'Descripción', startAt: '2099-01-05T12:00:00.000Z', endAt: '2099-01-05T13:00:00.000Z',
  location: { buildingKey: 'hbuilding', floorKey: 'floor-two' }, recurrence: { frequency: 'WEEKLY', interval: 1, until: '2099-01-19', timeZone: 'UTC', excludedDates: [] } });
function parsed(value: unknown = body(), publish = false): CreateActivitySeriesInput {
  const result = activitySeriesParser(publish)(value); assert.equal(result.success, true); return (result as { data: CreateActivitySeriesInput }).data;
}
const expand = (value: unknown) => expandActivityRecurrence(parsed(value), campusId, 'COMMUNITY_ACTIVITY', new Date('2026-01-01T00:00:00Z'));
let previewActivitySeries: typeof import('../src/modules/activities/activities.series.service.js').previewActivitySeries;
let createActivitySeries: typeof import('../src/modules/activities/activities.series.service.js').createActivitySeries;
let getActivitySeries: typeof import('../src/modules/activities/activities.series.service.js').getActivitySeries;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', SUPABASE_URL: 'https://recurrence-test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  ({ previewActivitySeries, createActivitySeries, getActivitySeries } = await import('../src/modules/activities/activities.series.service.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });
const basicDeps = (): ActivityDependencies => ({ getActiveMap: async () => map, now: () => now });

test('daily and weekly calendar rules honor interval, inclusive last start, duration and finite bounds', () => {
  const weekly = expand(body()); assert.equal(weekly.occurrences.length, 3);
  assert.equal(weekly.occurrences[2].startAt, '2099-01-19T12:00:00.000Z');
  const daily = expand({ ...body(), recurrence: { ...body().recurrence, frequency: 'DAILY', interval: 2, until: '2099-01-09' } });
  assert.deepEqual(daily.occurrences.map(value => value.startAt.substring(0, 10)), ['2099-01-05', '2099-01-07', '2099-01-09']);
  assert.throws(() => expand({ ...body(), recurrence: { ...body().recurrence, frequency: 'DAILY', until: '2100-01-01' } }), { status: 400 });
  assert.throws(() => expand({ ...body(), recurrence: { ...body().recurrence, until: '2102-01-01' } }), { status: 400 });
  assert.throws(() => expand({ ...body(), recurrence: { ...body().recurrence, until: '2099-01-04' } }), { status: 400 });
});

test('monthly rules skip nonexistent dates visibly, preserve anchor day after skips and handle leap days', () => {
  const monthly = expand({ ...body(), startAt: '2099-01-31T12:00:00.000Z', endAt: '2099-01-31T13:00:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'MONTHLY', until: '2099-05-31' } });
  assert.deepEqual(monthly.occurrences.map(value => value.startAt.substring(0, 10)), ['2099-01-31', '2099-03-31', '2099-05-31']);
  assert.deepEqual(monthly.skipped, [{ date: '2099-02-31', reason: 'INVALID_MONTH_DAY' }, { date: '2099-04-31', reason: 'INVALID_MONTH_DAY' }]);
  const leap = expand({ ...body(), startAt: '2096-01-29T12:00:00.000Z', endAt: '2096-01-29T13:00:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'MONTHLY', until: '2096-02-29' } });
  assert.equal(leap.occurrences[1].startAt, '2096-02-29T12:00:00.000Z');
});

test('exclusions remove only matching start dates, indices identify materialized occurrences and fingerprints bind all publication fields', () => {
  const excluded = expand({ ...body(), recurrence: { ...body().recurrence, excludedDates: ['2099-01-05'] } });
  assert.equal(excluded.occurrences.length, 2); assert.equal(excluded.occurrences[0].index, 1);
  assert.equal(excluded.occurrences[0].startAt, '2099-01-12T12:00:00.000Z'); assert.equal(excluded.skipped[0].reason, 'EXCLUDED');
  assert.notEqual(excluded.previewHash, expand(body()).previewHash);
  assert.notEqual(expand({ ...body(), title: 'Modificado' }).previewHash, expand(body()).previewHash);
  assert.throws(() => expand({ ...body(), recurrence: { ...body().recurrence, excludedDates: ['2099-01-06'] } }), { status: 400 });
  assert.throws(() => expand({ ...body(), recurrence: { ...body().recurrence, excludedDates: ['2099-01-05', '2099-01-12', '2099-01-19'] } }), { status: 400 });
});

test('saved IANA zone keeps both wall clocks across DST including multi-day durations instead of adding UTC days', () => {
  const spring = expand({ ...body(), startAt: '2027-03-13T15:00:00.000Z', endAt: '2027-03-13T16:00:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'DAILY', timeZone: 'America/New_York', until: '2027-03-15' } });
  assert.deepEqual(spring.occurrences.map(value => value.startAt.substring(11, 16)), ['15:00', '14:00', '14:00']);
  const overnight = expand({ ...body(), startAt: '2027-03-13T17:00:00.000Z', endAt: '2027-03-14T16:00:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'DAILY', timeZone: 'America/New_York', until: '2027-03-14' } });
  assert.equal(Date.parse(overnight.occurrences[0].endAt) - Date.parse(overnight.occurrences[0].startAt), 23 * 3600000);
  assert.equal(Date.parse(overnight.occurrences[1].endAt) - Date.parse(overnight.occurrences[1].startAt), 24 * 3600000);
  const fall = expand({ ...body(), startAt: '2027-11-06T14:00:00.000Z', endAt: '2027-11-06T15:00:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'DAILY', timeZone: 'America/New_York', until: '2027-11-08' } });
  assert.deepEqual(fall.occurrences.map(value => value.startAt.substring(11, 16)), ['14:00', '15:00', '15:00']);
});

test('DST gaps and ambiguous hours are rejected, while excluding that start date makes the series valid', () => {
  const gap = { ...body(), startAt: '2027-03-13T07:30:00.000Z', endAt: '2027-03-13T08:30:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'DAILY', timeZone: 'America/New_York', until: '2027-03-15' } };
  assert.throws(() => expand(gap), { status: 400 });
  assert.equal(expand({ ...gap, recurrence: { ...gap.recurrence, excludedDates: ['2027-03-14'] } }).occurrences.length, 2);
  assert.throws(() => expand({ ...body(), startAt: '2027-11-06T05:30:00.000Z', endAt: '2027-11-06T06:30:00.000Z',
    recurrence: { ...body().recurrence, frequency: 'DAILY', timeZone: 'America/New_York', until: '2027-11-08' } }), { status: 400 });
});

test('series parser requires bounded valid rules, prevents overrides, and publication requires its preview fingerprint', () => {
  for (const recurrence of [null, [], { ...body().recurrence, frequency: 'YEARLY' }, { ...body().recurrence, interval: 0 },
    { ...body().recurrence, interval: 1.5 }, { ...body().recurrence, interval: 53 }, { ...body().recurrence, until: '2099-02-30' },
    { ...body().recurrence, timeZone: 'Invalid/Zone' }, { ...body().recurrence, timeZone: '-03:00' },
    { ...body().recurrence, excludedDates: ['2099-01-05', '2099-01-05'] }, { ...body().recurrence, count: 10 }]) {
    assert.equal(activitySeriesParser()({ ...body(), recurrence }).success, false);
  }
  for (const key of ['campusId', 'type', 'createdByUserId', 'seriesId', 'occurrenceIndex']) assert.equal(activitySeriesParser()({ ...body(), [key]: 'override' }).success, false);
  assert.equal(activitySeriesParser(true)(body()).success, false);
  assert.equal(activitySeriesParser()({ ...body(), previewHash: 'a'.repeat(64) }).success, false);
});

test('series preview is read-only and publish creates separate activity IDs scoped to creator; changed preview and unauthorized official requests cannot write', async () => {
  let writes = 0; let savedSeries: ActivitySeriesDocument; let saved: ActivityDocument[] = [];
  const deps: ActivityDependencies = { ...basicDeps(), createSeries: async (series, documents) => {
    writes++; savedSeries = series; saved = documents; return documents.map(document => toVisibleActivity(document, campusId, now, spatialBuildings(map))!);
  } };
  const preview = await previewActivitySeries(auth, parsed(), deps); assert.equal(writes, 0);
  await assert.rejects(createActivitySeries(auth, parsed({ ...body(), previewHash: 'a'.repeat(64) }, true), deps), { status: 409 });
  await assert.rejects(previewActivitySeries(auth, parsed(), deps, true), { status: 403 });
  const result = await createActivitySeries(auth, parsed({ ...body(), previewHash: preview.previewHash }, true), deps);
  assert.equal(writes, 1); assert.equal(result.series.occurrenceCount, 3); assert.equal(new Set(saved.map(value => value._id.toHexString())).size, 3);
  for (const [index, document] of saved.entries()) {
    assert.equal(document.seriesId?.toHexString(), savedSeries!._id.toHexString()); assert.equal(document.occurrenceIndex, index + 1);
    assert.equal(document.participantCount, 1); assert.equal(document.createdByUserId, userId); assert.equal(document.campusId, campusId);
    assert.deepEqual(document.originalStartAt, document.startAt);
  }
  assert.equal(result.firstOccurrence.participation.status, 'JOINED');
  const admin = { ...auth, roles: [{ id: 'admin', name: 'ADMINISTRADOR', campusId }] };
  assert.equal((await previewActivitySeries(admin, parsed(), deps, true)).type, 'OFFICIAL_EVENT');
});

test('series transaction embeds its template without new collections and rolls back if creator enrollment fails', async () => {
  let staged: { name: string; documents: unknown[] }[] = []; const committed: typeof staged = []; let fail = false; let activeMap = map;
  const session = { withTransaction: async (operation: () => Promise<unknown>) => {
    staged = []; try { const value = await operation(); committed.push(...staged); return value; } finally { staged = []; }
  } };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: (value: typeof session) => Promise<unknown>) => operation(session));
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => {
    assert.ok(['activities', 'activity_participation', 'campus_maps'].includes(name), 'Only existing collections allowed');
    return {
    indexes: async () => name === 'activities' ? [{ key: { seriesId: 1, occurrenceIndex: 1 }, unique: true, partialFilterExpression: { seriesId: { $type: 'objectId' } } }]
      : [{ key: { activityId: 1, userId: 1 }, unique: true }],
    findOne: async (filter: unknown, options: { session: unknown }) => { assert.equal(options.session, session); assert.deepEqual(filter, { campusId, status: 'ACTIVE' }); return activeMap; },
    insertMany: async (documents: unknown[], options: { session: unknown }) => {
      assert.equal(options.session, session); if (fail && name === 'activity_participation') throw new Error('Enrollment failed'); staged.push({ name, documents });
    },
  }; });
  try {
    const preview = await previewActivitySeries(auth, parsed(), basicDeps()); const input = parsed({ ...body(), previewHash: preview.previewHash }, true);
    await createActivitySeries(auth, input, basicDeps()); assert.equal(committed.length, 2);
    const activities = committed[0].documents as ActivityDocument[]; const own = committed[1].documents as ActivityParticipationDocument[];
    assert.equal(activities.length, 3); assert.equal(own.length, 3);
    assert.equal(activities.filter(value => value.seriesDefinition).length, 1);
    assert.deepEqual(activities[0].seriesDefinition!._id, activities[0].seriesId);
    assert.equal(activities[0].seriesDefinition!.recurrence.frequency, 'WEEKLY');
    own.forEach((value, index) => { assert.deepEqual(value.activityId, activities[index]._id); assert.equal(value.status, 'JOINED'); assert.equal(value.userId, userId); });
    fail = true; await assert.rejects(createActivitySeries(auth, input, basicDeps()), /Enrollment failed/); assert.equal(committed.length, 2); assert.equal(staged.length, 0);
    activeMap = { ...map, buildings: [] }; await assert.rejects(createActivitySeries(auth, input, basicDeps()), { status: 400 }); assert.equal(committed.length, 2);
  } finally { sessionMock.mock.restore(); dbMock.mock.restore(); }
});

test('series insertMany reaches driver dispatch with a real CSOT transaction instead of an inherited timeout argument failure', async () => {
  const { mongoClient } = await import('../src/database/mongodb/client.js');
  assert.ok(mongoClient.options.timeoutMS! > 0, 'Regression must run with the configured client deadline');
  let dispatched = 0; const sentinel = new Error('Command dispatch reached without connecting');
  const connectMock = mock.method(mongoClient, 'connect', async () => { dispatched++; throw sentinel; });
  const originalCollection = Db.prototype.collection;
  const dbMock = mock.method(Db.prototype, 'collection', function (this: Db, name: string) {
    const collection = originalCollection.call(this, name);
    mock.method(collection, 'indexes', async () => name === 'activities' ? [{ key: { seriesId: 1, occurrenceIndex: 1 }, unique: true, partialFilterExpression: { seriesId: { $type: 'objectId' } } }]
      : [{ key: { activityId: 1, userId: 1 }, unique: true }]);
    mock.method(collection, 'findOne', async () => map);
    return collection;
  });
  try {
    const preview = await previewActivitySeries(auth, parsed(), basicDeps());
    // withSession/withTransaction/insertMany remain the real driver, including the client deadline.
    await assert.rejects(createActivitySeries(auth, parsed({ ...body(), previewHash: preview.previewHash }, true), basicDeps()), error => error === sentinel);
    assert.equal(dispatched, 1);
  } finally { connectMock.mock.restore(); dbMock.mock.restore(); }
});

test('series browsing cannot expose foreign, hidden, expired, invalid-POI or unrelated occurrences and preserves legacy activity DTOs', async () => {
  let series!: ActivitySeriesDocument; let documents: ActivityDocument[] = [];
  const deps = { ...basicDeps(), createSeries: async (value: ActivitySeriesDocument, values: ActivityDocument[]) => {
    series = value; documents = values; return values.map(document => toVisibleActivity(document, campusId, now, spatialBuildings(map))!);
  }, findSeries: async () => series, findSeriesOccurrences: async () => documents };
  const preview = await previewActivitySeries(auth, parsed(), deps); await createActivitySeries(auth, parsed({ ...body(), previewHash: preview.previewHash }, true), deps);
  const first = documents[0]; documents = [first, { ...documents[1], status: 'HIDDEN' }, { ...documents[2], campusId: other },
    { ...first, _id: new ObjectId(), endAt: now }, { ...first, _id: new ObjectId(), location: { ...first.location, poiKey: 'hidden' } },
    { ...first, _id: new ObjectId(), seriesId: new ObjectId() }];
  const result = await getActivitySeries(auth, series._id.toHexString(), deps); assert.equal(result.occurrences.length, 1); assert.equal(result.occurrenceCount, 3);
  await assert.rejects(getActivitySeries(auth, series._id.toHexString(), { ...deps, findSeries: async () => ({ ...series, campusId: other }) }), { status: 404 });
  await assert.rejects(getActivitySeries(auth, series._id.toHexString(), { ...deps, findSeriesOccurrences: async () => [] }), { status: 404 });
  const { seriesId, occurrenceIndex, occurrenceCount, originalStartAt, ...legacy } = first;
  assert.equal(toVisibleActivity(legacy, campusId, now, spatialBuildings(map))?.series, undefined);
});

test('joining one occurrence never registers or increments another occurrence in the same series', async () => {
  let documents: ActivityDocument[] = []; const own = new Map<string, ActivityParticipationDocument>();
  const visitor = { ...auth, userId: other, profile: { ...auth.profile, id: other } };
  const deps: ActivityDependencies = { ...basicDeps(), createSeries: async (_series, values) => {
    documents = values; return values.map(document => toVisibleActivity(document, campusId, now, spatialBuildings(map))!);
  }, findActivity: async (_campus, id) => documents.find(value => value._id.toHexString() === id) ?? null,
  findParticipation: async (_campus, id) => own.get(id) ?? null, findOrganizer: async () => ({ name: 'Organizador' }),
  registerParticipation: async (campus, id, user) => {
    const value = documents.find(document => document._id.toHexString() === id)!; value.participantCount++;
    own.set(id, { activityId: value._id, campusId: campus, userId: user, status: 'JOINED', joinedAt: now, updatedAt: now });
  } };
  const preview = await previewActivitySeries(auth, parsed(), deps);
  await createActivitySeries(auth, parsed({ ...body(), previewHash: preview.previewHash }, true), deps);
  const { joinActivity, getActivityDetail } = await import('../src/modules/activities/activities.detail.service.js');
  await joinActivity(visitor, documents[0]._id.toHexString(), deps);
  assert.equal(own.size, 1); assert.equal(documents[0].participantCount, 2); assert.equal(documents[1].participantCount, 1);
  assert.equal((await getActivityDetail(visitor, documents[1]._id.toHexString(), deps)).participation.status, 'NOT_JOINED');
});

test('series writes fail closed without the partial unique occurrence index', async () => {
  let writes = 0;
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({
    indexes: async () => name === 'activities' ? [] : [{ key: { activityId: 1, userId: 1 }, unique: true }],
    insertMany: async () => { writes++; }, insertOne: async () => { writes++; },
  }));
  try {
    const preview = await previewActivitySeries(auth, parsed(), basicDeps()); const input = parsed({ ...body(), previewHash: preview.previewHash }, true);
    await assert.rejects(createActivitySeries(auth, input, basicDeps()), { status: 503 }); assert.equal(writes, 0);
  } finally { dbMock.mock.restore(); }
});

test('HTTP preview/publication/list/series/detail enforce identity, reviewed dates and independent occurrence participation', async () => {
  const originalFetch = globalThis.fetch; let series!: ActivitySeriesDocument; let documents: ActivityDocument[] = [];
  globalThis.fetch = async input => { const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]); return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js'); const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json()); app.use('/api/v1/activities', createActivitiesRouter({ ...basicDeps(),
    createSeries: async (value, values) => { series = value; documents = values; return values.map(document => toVisibleActivity(document, campusId, now, spatialBuildings(map))!); },
    findSeries: async () => series, findSeriesOccurrences: async () => documents, findActivities: async () => documents,
    findActivity: async (_campus, id) => documents.find(document => document._id.toHexString() === id) ?? null,
    findParticipation: async (_campus, id) => ({ activityId: new ObjectId(id), campusId, userId, status: 'JOINED', joinedAt: now, updatedAt: now }),
  })); app.use(apiErrorHandler); const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities`;
  const headers = { Authorization: 'Bearer series.test.token', 'Content-Type': 'application/json' };
  const post = (path: string, payload: unknown) => originalFetch(base + path, { method: 'POST', headers, body: JSON.stringify(payload) });
  try {
    assert.equal((await originalFetch(base + '/series/preview', { method: 'POST' })).status, 401);
    assert.equal((await post('/series/official/preview', body())).status, 403);
    assert.equal((await post('/series', body())).status, 400); assert.equal(documents.length, 0);
    const previewResponse = await post('/series/preview', body()); assert.equal(previewResponse.status, 200); assert.equal(previewResponse.headers.get('cache-control'), 'no-store');
    const preview = (await previewResponse.json()).data; assert.equal(documents.length, 0);
    assert.equal((await post('/series', { ...body(), title: 'Changed', previewHash: preview.previewHash })).status, 409); assert.equal(documents.length, 0);
    const createdResponse = await post('/series', { ...body(), previewHash: preview.previewHash }); assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()).data; assert.equal(created.firstOccurrence.series.id, created.series.id);
    const list = (await (await originalFetch(base, { headers })).json()).data; assert.equal(list.length, 3); assert.equal(list[1].series.index, 2);
    const detail = (await (await originalFetch(base + '/' + list[1].id, { headers })).json()).data;
    assert.equal(detail.id, list[1].id); assert.equal(detail.series.index, 2); assert.equal(detail.participation.status, 'JOINED');
    const seriesResponse = await originalFetch(base + '/series/' + created.series.id, { headers }); assert.equal(seriesResponse.status, 200);
    assert.equal((await seriesResponse.json()).data.occurrences.length, 3);
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('series migration is additive/idempotent and partial uniqueness leaves single activities outside the index', () => {
  const script = readFileSync(new URL('../src/database/mongodb/003_activity_series.mongosh.js', import.meta.url), 'utf8');
  const names = ['activities', 'activity_participation']; let creates = 0; const indexes = new Map<string, unknown>();
  const db = { getCollectionNames: () => names, createCollection: (name: string) => { names.push(name); creates++; },
    activities: { createIndex: (_key: unknown, options: { name: string }) => indexes.set(options.name, options) } };
  runInNewContext(script, { db }); runInNewContext(script, { db }); assert.equal(creates, 0); assert.equal(indexes.size, 1);
  const index = indexes.get('series_occurrence_uq') as { unique: boolean; partialFilterExpression: unknown };
  assert.equal(index.unique, true); assert.equal(JSON.stringify(index.partialFilterExpression), JSON.stringify({ seriesId: { $type: 'objectId' } }));
});

test('frontend recurrence fields validate calendar exceptions and retain supplied device zone for server preview', () => {
  const result = recurrenceDraftRule('MONTHLY', '2', '31/12/2099', '31/03/2099,31/05/2099', 'America/Santiago');
  assert.ok(result.rule); assert.deepEqual(result.rule.excludedDates, ['2099-03-31', '2099-05-31']); assert.equal(result.rule.timeZone, 'America/Santiago');
  for (const [interval, until, exclusions, zone] of [['0', '31/12/2099', '', 'UTC'], ['1', '31/02/2099', '', 'UTC'],
    ['1', '31/12/2099', '31/03/2099,31/03/2099', 'UTC'], ['1', '31/12/2099', '', '']]) assert.ok(recurrenceDraftRule('WEEKLY', interval, until, exclusions, zone).error);
});
