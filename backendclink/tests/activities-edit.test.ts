import assert from 'node:assert/strict';
import { before, after, mock, test } from 'node:test';
import { Db, MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { editActivityParser } from '../src/modules/activities/activities.edit.validation.js';
import type { VerifiedAuthConnection } from '../src/modules/auth/auth.types.js';
import type { ActivityDocument, ActivitySeriesDocument } from '../src/modules/activities/activities.types.js';
import type { ActivityEditDependencies, EditActivityInput } from '../src/modules/activities/activities.edit.types.js';
import type { CampusMapDocument } from '../src/modules/maps/map.types.js';
import { activityEditDraft, validateActivityEditDraft } from '../../frontendclink/src/features/activities/types/editing.js';

const campusId = '22222222-2222-4222-8222-222222222222', userId = '11111111-1111-4111-8111-111111111111';
const other = '33333333-3333-4333-8333-333333333333'; const now = new Date('2099-01-01T00:00:00Z');
const auth: VerifiedAuthConnection = { userId, campusId, roles: [], permissions: [], profile: { id: userId, campus_id: campusId,
  institucion_id: campusId, nombre_completo: 'Creador', foto_path: null, verificado_en: now.toISOString(), estado_cuenta: 'ACTIVA', deleted_at: null } };
const map: CampusMapDocument = { campusId, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now, buildings: [
  { id: 'h', name: 'H', floors: [{ id: 'f2', name: 'Piso 2', meshName: 'other_mesh', pois: [{ poiKey: 'library', name: 'Biblioteca', isVisible: true }] },
    { id: 'f3', name: 'Piso 3', pois: [{ poiKey: 'hidden', name: 'Oculto', isVisible: false }] }] },
] };
const document = (): ActivityDocument => ({ _id: new ObjectId(), campusId, createdByUserId: userId, title: 'Original', description: 'Descripción',
  type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC', startAt: new Date('2099-01-05T12:00:00Z'), endAt: new Date('2099-01-05T13:00:00Z'),
  location: { buildingKey: 'h', floorKey: 'f2' }, participantCount: 7, createdAt: now, updatedAt: now });
const body = () => ({ title: 'Editada', description: 'Descripción nueva', startAt: '2099-01-05T14:00:00.000Z', endAt: '2099-01-05T15:00:00.000Z',
  location: { buildingKey: 'h', floorKey: 'f3' }, scope: 'ONE', expectedRevision: 0 });
const parsed = (value: unknown = body(), save = false): EditActivityInput => { const result = editActivityParser(save)(value); assert.equal(result.success, true);
  return (result as { data: EditActivityInput }).data; };
const deps = (value: ActivityDocument): ActivityEditDependencies => ({ now: () => now, getActiveMap: async () => map, findEditable: async () => value });
let preview: typeof import('../src/modules/activities/activities.edit.service.js').previewActivityEdit;
let edit: typeof import('../src/modules/activities/activities.edit.service.js').editActivity;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', SUPABASE_URL: 'https://edit-test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  ({ previewActivityEdit: preview, editActivity: edit } = await import('../src/modules/activities/activities.edit.service.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });

test('edit parser rejects identity/type/series/participation overrides, invalid revisions and missing confirmation', () => {
  for (const key of ['type', 'campusId', 'createdByUserId', 'organizer', 'participantCount', 'status', 'seriesId', 'recurrence', 'editRevision']) {
    assert.equal(editActivityParser()({ ...body(), [key]: 'override' }).success, false);
  }
  for (const change of [{ scope: 'ALL' }, { expectedRevision: -1 }, { expectedRevision: 0.5 }, { startAt: '2099-02-30T00:00:00Z' }]) {
    assert.equal(editActivityParser()({ ...body(), ...change }).success, false);
  }
  assert.equal(editActivityParser(true)(body()).success, false);
  assert.equal(editActivityParser()({ ...body(), previewHash: 'a'.repeat(64) }).success, false);
});

test('only creator with active campus access edits; admin cannot override ownership, hidden and foreign publications stay unavailable', async () => {
  const value = document(), id = value._id.toHexString();
  await assert.rejects(preview({ ...auth, userId: other, profile: { ...auth.profile, id: other }, roles: [{ id: 'a', name: 'ADMINISTRADOR', campusId }] }, id, parsed(), deps(value)), { status: 403 });
  for (const change of [{ campusId: other }, { status: 'HIDDEN' }, { visibility: 'PRIVATE' }]) {
    await assert.rejects(preview(auth, id, parsed(), deps({ ...value, ...change })), { status: 404 });
  }
  await assert.rejects(preview({ ...auth, profile: { ...auth.profile, estado_cuenta: 'SUSPENDIDA' } }, id, parsed(), deps(value)), { status: 403 });
  await assert.rejects(preview(auth, id, parsed({ ...body(), location: { buildingKey: 'h', floorKey: 'f3', poiKey: 'hidden' } }), deps(value)), { status: 400 });
  await assert.rejects(preview(auth, id, { ...parsed(), endAt: parsed().startAt }, deps(value)), { status: 400 });
});

test('preview can correct an ongoing or ended own publication and inactive old location without writing, preserving immutable fields', async () => {
  const value = { ...document(), startAt: new Date('2098-12-01T12:00:00Z'), endAt: new Date('2098-12-01T13:00:00Z'),
    location: { buildingKey: 'h', floorKey: 'f3', poiKey: 'hidden' } };
  const old = JSON.stringify(value); const result = await preview(auth, value._id.toHexString(), parsed(), deps(value));
  assert.equal(JSON.stringify(value), old); assert.equal(result.changes.length, 1); assert.equal(result.changes[0].after.type, value.type);
  assert.ok(result.changes[0].changedFields.includes('location'));
  const ongoing = { ...value, endAt: new Date('2099-01-01T01:00:00Z') };
  assert.equal((await preview(auth, value._id.toHexString(), parsed(), deps(ongoing))).changes.length, 1);
});

function recurring() {
  const first = document(), seriesId = new ObjectId();
  const values = [0, 1, 2].map(index => ({ ...first, _id: new ObjectId(), seriesId, occurrenceIndex: index + 1, occurrenceCount: 3,
    startAt: new Date(`2099-01-${String(5 + index * 7).padStart(2, '0')}T12:00:00Z`),
    endAt: new Date(`2099-01-${String(5 + index * 7).padStart(2, '0')}T13:00:00Z`), originalStartAt: first.startAt }));
  const series: ActivitySeriesDocument = { ...first, _id: seriesId, type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
    location: { buildingKey: 'h', floorKey: 'f2' }, occurrenceCount: 3, skipped: [], recurrence: { frequency: 'WEEKLY', interval: 1,
      until: '2099-01-19', timeZone: 'UTC', excludedDates: [] } };
  return { values, series };
}

test('upcoming preview shifts existing local calendar dates from selected index, preserves past/ongoing IDs, and rejects moving future instances into past', async () => {
  const { values, series } = recurring(); const current = values[1]; const fixedNow = new Date('2099-01-05T12:30:00Z');
  const dependencies = { ...deps(current), now: () => fixedNow, findSeries: async () => series, findEditOccurrences: async () => values };
  const input = parsed({ ...body(), scope: 'UPCOMING', startAt: '2099-01-13T14:00:00Z', endAt: '2099-01-13T15:00:00Z' });
  const result = await preview(auth, current._id.toHexString(), input, dependencies);
  assert.equal(result.changes.length, 2); assert.equal(result.changes[0].activityId, current._id.toHexString());
  assert.equal(result.changes[1].after.startAt.toISOString(), '2099-01-20T14:00:00.000Z');
  assert.equal(values[0].startAt.toISOString(), '2099-01-05T12:00:00.000Z'); assert.equal(values[0].participantCount, 7);
  await assert.rejects(preview(auth, values[0]._id.toHexString(), input, { ...dependencies, findEditable: async () => values[0] }), { status: 400 });
  await assert.rejects(preview(auth, current._id.toHexString(), { ...input, startAt: fixedNow, endAt: new Date(fixedNow.getTime() + 3600000) }, dependencies), { status: 400 });
});

test('upcoming edits preserve saved-zone wall clocks across DST and reject nonexistent shifted hours', async () => {
  const { values, series } = recurring(); series.recurrence.timeZone = 'America/New_York';
  values[0].startAt = new Date('2027-03-13T15:00:00Z'); values[0].endAt = new Date('2027-03-13T16:00:00Z');
  values[1].startAt = new Date('2027-03-20T14:00:00Z'); values[1].endAt = new Date('2027-03-20T15:00:00Z');
  values.splice(2); values.forEach(value => { value.occurrenceCount = 2; }); series.occurrenceCount = 2;
  const dependencies = { ...deps(values[0]), now: () => new Date('2027-03-01T00:00:00Z'), findSeries: async () => series, findEditOccurrences: async () => values };
  const result = await preview(auth, values[0]._id.toHexString(), parsed({ ...body(), scope: 'UPCOMING', startAt: '2027-03-13T16:00:00Z', endAt: '2027-03-13T17:00:00Z' }), dependencies);
  assert.equal(result.changes[1].after.startAt.toISOString(), '2027-03-20T15:00:00.000Z');
  values[0].startAt = new Date('2027-03-13T06:30:00Z'); values[0].endAt = new Date('2027-03-13T08:30:00Z');
  values[1].startAt = new Date('2027-03-14T05:30:00Z'); values[1].endAt = new Date('2027-03-14T07:30:00Z');
  await assert.rejects(preview(auth, values[0]._id.toHexString(), parsed({ ...body(), scope: 'UPCOMING', startAt: '2027-03-13T07:30:00Z', endAt: '2027-03-13T08:30:00Z' }), dependencies), { status: 400 });
});

test('fingerprint binds content, scope and every target revision; joining does not invalidate preview and no-op has no changed fields', async () => {
  const { values, series } = recurring(); const current = values[0]; let writes = 0;
  const dependencies: ActivityEditDependencies = { ...deps(current), findSeries: async () => series, findEditOccurrences: async () => values,
    saveEdit: async plan => { writes++; return { activityId: plan.activityId, updatedCount: plan.changes.filter(value => value.changedFields.length).length, revision: 1 }; } };
  const input = parsed({ ...body(), scope: 'UPCOMING' }); const first = await preview(auth, current._id.toHexString(), input, dependencies);
  current.participantCount++; current.updatedAt = new Date();
  assert.equal((await preview(auth, current._id.toHexString(), input, dependencies)).previewHash, first.previewHash);
  await assert.rejects(edit(auth, current._id.toHexString(), { ...input, title: 'Different', previewHash: first.previewHash }, dependencies), { status: 409 });
  values[1].editRevision = 1;
  await assert.rejects(edit(auth, current._id.toHexString(), { ...input, previewHash: first.previewHash }, dependencies), { status: 409 }); assert.equal(writes, 0);
  current.editRevision = 1; await assert.rejects(preview(auth, current._id.toHexString(), input, dependencies), { status: 409 });
  const noop = await preview(auth, current._id.toHexString(), { ...input, title: current.title, description: current.description,
    location: { buildingKey: 'h', floorKey: 'f2' }, startAt: current.startAt, endAt: current.endAt, expectedRevision: 1, scope: 'ONE' }, dependencies);
  assert.deepEqual(noop.changes[0].changedFields, []);
});

test('edit and immutable history commit together; stale snapshot, location loss and failed history rollback without touching participation/count/series', async () => {
  let current = document(), activeMap = map, fail = false, conflict = false; const id = current._id.toHexString();
  let staged: { name: string; data: any }[] = []; const committed: typeof staged = [];
  const session = { withTransaction: async (operation: () => Promise<unknown>) => { staged = []; try { const result = await operation(); committed.push(...staged); return result; } finally { staged = []; } } };
  const sessionMock = mock.method(MongoClient.prototype, 'withSession', async (operation: (session: typeof session) => Promise<unknown>) => operation(session));
  const collectionMock = mock.method(Db.prototype, 'collection', (name: string) => {
    assert.ok(['activities', 'campus_maps'].includes(name), 'Only existing collections allowed');
    return {
      findOne: async (_filter: unknown, options: { session: unknown }) => { assert.equal(options.session, session); return name === 'campus_maps' ? activeMap : current; },
      bulkWrite: async (operations: any[], options: { session: unknown }) => { assert.equal(options.session, session); staged.push({ name, data: operations }); if (fail) throw new Error('Embedded history failed'); return { matchedCount: conflict ? 0 : operations.length }; },
    };
  });
  try {
    const input = parsed(), review = await preview(auth, id, input, deps(current));
    const { commitActivityEdit } = await import('../src/modules/activities/activities.edit.repository.js');
    const result = await commitActivityEdit(auth, id, { ...input, previewHash: review.previewHash }, now);
    assert.equal(result.updatedCount, 1); assert.equal(committed.length, 1);
    const history = committed[0].data[0].updateOne.update.$push.changeHistory;
    assert.equal(history.before.title, 'Original'); assert.equal(history.after.title, 'Editada');
    assert.equal(history.actorUserId, userId); assert.equal(history.revision, 1);
    assert.deepEqual(history.notificationReasons, ['DATES_CHANGED', 'LOCATION_CHANGED', 'CONTENT_CHANGED']);
    assert.equal(committed[0].data[0].updateOne.update.$set.participantCount, undefined); assert.equal(committed[0].data[0].updateOne.update.$set.createdByUserId, undefined);
    fail = true; await assert.rejects(commitActivityEdit(auth, id, { ...input, previewHash: review.previewHash }, now), /Embedded history failed/); assert.equal(committed.length, 1);
    fail = false; conflict = true; await assert.rejects(commitActivityEdit(auth, id, { ...input, previewHash: review.previewHash }, now), { status: 409 });
    conflict = false; current = { ...current, title: 'Concurrent edit' }; await assert.rejects(commitActivityEdit(auth, id, { ...input, previewHash: review.previewHash }, now), { status: 409 });
    current.title = 'Original'; activeMap = { ...map, buildings: [] }; await assert.rejects(commitActivityEdit(auth, id, { ...input, previewHash: review.previewHash }, now), { status: 400 });
    assert.equal(committed.length, 1); assert.equal(staged.length, 0);
  } finally { sessionMock.mock.restore(); collectionMock.mock.restore(); }
});

test('HTTP authenticated owner preview and PATCH enforce confirmation; shared detail exposes editing only to creator', async () => {
  const value = document(); const id = value._id.toHexString(); const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => { const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, email: 'test@duocuc.cl', email_confirmed_at: now.toISOString() });
    if (url.pathname.endsWith('/perfil_usuario')) return Response.json([auth.profile]); return Response.json([]);
  };
  const { createActivitiesRouter } = await import('../src/modules/activities/activities.routes.js'); const { apiErrorHandler } = await import('../src/middleware/apiErrorHandler.js');
  const app = express(); app.use(express.json()); app.use('/api/v1/activities', createActivitiesRouter({ ...deps(value), findActivity: async () => value,
    findParticipation: async () => null, findOrganizer: async () => ({ name: 'Creador' }), saveEdit: async plan => ({ activityId: plan.activityId, revision: 1, updatedCount: 1 }) })); app.use(apiErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/activities/${id}`;
  const headers = { Authorization: 'Bearer edit.test.token', 'Content-Type': 'application/json' };
  const post = (payload: unknown) => originalFetch(url + '/edit/preview', { method: 'POST', headers, body: JSON.stringify(payload) });
  try {
    assert.equal((await originalFetch(url, { method: 'PATCH' })).status, 401);
    assert.equal((await post({ ...body(), type: 'OFFICIAL_EVENT' })).status, 400);
    const response = await post(body()); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const review = (await response.json()).data;
    assert.equal((await originalFetch(url, { method: 'PATCH', headers, body: JSON.stringify(body()) })).status, 400);
    const saved = await originalFetch(url, { method: 'PATCH', headers, body: JSON.stringify({ ...body(), previewHash: review.previewHash }) }); assert.equal(saved.status, 200);
    assert.equal((await saved.json()).data.updatedCount, 1);
    const detail = (await (await originalFetch(url, { headers })).json()).data; assert.equal(detail.editing.revision, 0);
    const { getActivityDetail } = await import('../src/modules/activities/activities.detail.service.js');
    assert.equal((await getActivityDetail({ ...auth, userId: other, profile: { ...auth.profile, id: other } }, id,
      { ...deps(value), findActivity: async () => value, findParticipation: async () => null, findOrganizer: async () => ({ name: 'Creador' }) })).editing, undefined);
  } finally { globalThis.fetch = originalFetch; await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('edit form retains precise unchanged timestamps and allows correcting ended dates', () => {
  const activity = { id: new ObjectId().toHexString(), campusId, title: 'Original', description: 'Descripción', type: 'COMMUNITY_ACTIVITY' as const, status: 'ACTIVE' as const,
    startAt: '2000-01-05T12:00:30.123Z', endAt: '2000-01-05T13:00:45.456Z', location: { buildingKey: 'h', buildingName: 'H', floorKey: 'f2', floorName: 'Piso 2' },
    organizer: { name: 'Creador' }, participation: { status: 'JOINED' as const, canJoin: false }, editing: { revision: 0, canEditUpcoming: false } };
  const locations = [{ id: 'h', name: 'H', floors: [{ id: 'f2', name: 'Piso 2', pois: [] }] }];
  const parsedDraft = validateActivityEditDraft({ ...activityEditDraft(activity), title: 'Cambiada' }, activity, locations, 'ONE');
  assert.ok(parsedDraft.input); assert.equal(parsedDraft.input.startAt, activity.startAt); assert.equal(parsedDraft.input.endAt, activity.endAt);
  assert.ok(validateActivityEditDraft(activityEditDraft(activity), { ...activity, editing: undefined }, locations, 'ONE').error);
  const short = { ...activity, endAt: '2000-01-05T12:00:45.456Z' };
  assert.equal(validateActivityEditDraft(activityEditDraft(short), short, locations, 'ONE').input?.endAt, short.endAt);
});
