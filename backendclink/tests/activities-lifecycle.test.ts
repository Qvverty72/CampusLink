import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { Db, ObjectId } from 'mongodb';
import type { ActivityDocument } from '../src/modules/activities/types/activities.types.js';

let lifecycle: typeof import('../src/modules/activities/repositories/activities.lifecycle.js');
let maintain: typeof import('../src/modules/activities/workers/activities.notifications.worker.js').maintainActivities;
before(async () => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost:27017', SUPABASE_URL: 'https://lifecycle-test.invalid',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'server-test-key' });
  lifecycle = await import('../src/modules/activities/repositories/activities.lifecycle.js');
  ({ maintainActivities: maintain } = await import('../src/modules/activities/workers/activities.notifications.worker.js'));
});
after(async () => { await (await import('../src/database/mongodb/client.js')).closeMongoDB(); });
const now = new Date('2099-01-05T13:00:00Z');
const document = (patch: Partial<ActivityDocument> = {}): ActivityDocument => ({ _id: new ObjectId(), campusId: 'campus', createdByUserId: 'creator',
  title: 'Actividad', description: 'Descripción', type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
  startAt: new Date('2099-01-05T12:00:00Z'), endAt: now, location: { buildingKey: 'h', floorKey: 'f' },
  participantCount: 7, createdAt: new Date('2099-01-01'), updatedAt: new Date('2099-01-01'), ...patch });

test('completion catches up both types at the exact end boundary, preserves data and is idempotent without changing deleted/hidden/future rows', async () => {
  const originalSeries = { _id: new ObjectId(), status: 'ACTIVE' };
  const history = [{ revision: 1 }];
  const rows = [document({ seriesId: originalSeries._id, seriesDefinition: originalSeries as any, changeHistory: history as any }),
    document({ type: 'OFFICIAL_EVENT', endAt: new Date('2098-01-01'), startAt: new Date('2097-01-01') }),
    document({ visibility: 'PRIVATE' }), document({ endAt: new Date(now.getTime() + 1) }),
    document({ status: 'HIDDEN' }), document({ status: 'DELETED', deletedAt: now }), document({ status: 'CANCELLED' }),
    document({ deletedAt: now }), document({ type: 'UNKNOWN' }), document({ endAt: '2098-01-01' as any }),
    document({ startAt: now, endAt: now }), document({ startAt: new Date('2100-01-01') })];
  const ids = rows.map(row => row._id);
  const dbMock = mock.method(Db.prototype, 'collection', (name: string) => ({ updateMany: async (filter: any, update: any) => {
    assert.equal(name, 'activities');
    assert.deepEqual(filter, { type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] }, status: 'ACTIVE', deletedAt: null,
      startAt: { $type: 'date' }, endAt: { $type: 'date', $lte: now }, $expr: { $gt: ['$endAt', '$startAt'] } });
    assert.deepEqual(update, { $set: { status: 'FINISHED', updatedAt: now } });
    let modifiedCount = 0;
    for (const row of rows) if (filter.type.$in.includes(row.type) && row.status === filter.status && row.deletedAt == null
      && row.startAt instanceof Date && row.endAt instanceof Date && row.endAt <= filter.endAt.$lte && row.endAt > row.startAt) {
      Object.assign(row, update.$set); modifiedCount++;
    }
    return { modifiedCount };
  } }));
  try {
    assert.equal(await lifecycle.finishEndedActivities(now), 3);
    assert.equal(await lifecycle.finishEndedActivities(now), 0);
    assert.deepEqual(rows.map(row => row._id), ids);
    assert.equal(rows[0].seriesDefinition, originalSeries); assert.equal(rows[0].seriesDefinition?.status, 'ACTIVE');
    assert.equal(rows[0].changeHistory, history); assert.equal(rows[0].participantCount, 7);
    assert.ok(rows.slice(0, 3).every(row => row.status === 'FINISHED'));
    assert.deepEqual(rows.slice(3).map(row => row.status), ['ACTIVE', 'HIDDEN', 'DELETED', 'CANCELLED', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE']);
  } finally { dbMock.mock.restore(); }
});

test('completion query rejects an invalid clock and never depends on visibility, campus location or series template status', () => {
  assert.throws(() => lifecycle.finishedActivityFilter(new Date('invalid')));
  const filter = lifecycle.finishedActivityFilter(now);
  assert.equal(filter.visibility, undefined); assert.equal(filter.campusId, undefined); assert.equal(filter.seriesDefinition, undefined);
});

test('maintenance completes ended publications before notifications and continues delivery if lifecycle reconciliation fails', async () => {
  const order: string[] = [];
  assert.deepEqual(await maintain({ finishEnded: async () => { order.push('finish'); return 2; },
    notifications: async () => { order.push('notify'); return { delivered: 1, failed: 0 }; } }), { finished: 2, delivered: 1, failed: 0 });
  assert.deepEqual(order, ['finish', 'notify']);
  const log = mock.method(console, 'error', () => {});
  try {
    assert.deepEqual(await maintain({ finishEnded: async () => { throw new Error('Mongo unavailable'); },
      notifications: async () => ({ delivered: 1, failed: 0 }) }), { finished: 0, delivered: 1, failed: 0 });
    assert.equal(log.mock.callCount(), 1);
  } finally { log.mock.restore(); }
});

test('notification failure cannot prevent already completed lifecycle work, and shutdown suppresses subsequent work', async () => {
  let finished = 0; let stopped = false; let notified = 0;
  await assert.rejects(maintain({ finishEnded: async () => { finished++; return 1; },
    notifications: async () => { throw new Error('SQL unavailable'); } }), /SQL unavailable/);
  assert.equal(finished, 1);
  const deps = { finishEnded: async () => { stopped = true; return 1; },
    notifications: async () => { notified++; return { delivered: 0, failed: 0 }; } };
  assert.deepEqual(await maintain(deps, () => stopped), { finished: 1, delivered: 0, failed: 0 });
  assert.deepEqual(await maintain(deps, () => stopped), { finished: 0, delivered: 0, failed: 0 });
  assert.equal(notified, 0);
});
