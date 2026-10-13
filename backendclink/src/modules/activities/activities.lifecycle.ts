import type { Filter } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import type { ActivityDocument } from './activities.types.js';

/** Time-based completion, independent of visibility/location; never overwrite moderation/deletion. */
export function finishedActivityFilter(now: Date): Filter<ActivityDocument> {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid lifecycle timestamp is required.');
  return { type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] }, status: 'ACTIVE', deletedAt: null,
    startAt: { $type: 'date' }, endAt: { $type: 'date', $lte: now }, $expr: { $gt: ['$endAt', '$startAt'] } };
}

/** Conditional writes also catch up after downtime and are safe across retries/multiple workers. */
export async function finishEndedActivities(now = new Date()): Promise<number> {
  const result = await getMongoDb().collection<ActivityDocument>('activities').updateMany(
    finishedActivityFilter(now), { $set: { status: 'FINISHED', updatedAt: now } });
  return result.modifiedCount;
}
