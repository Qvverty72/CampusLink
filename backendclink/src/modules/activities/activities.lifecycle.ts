import type { Filter } from 'mongodb';
import { getMongoDB as getMongoDb } from '../../database/mongodb/client.js';
import type { ActivityDocument } from './activities.types.js';

/** Selecciona actividades vencidas sin depender de visibilidad o ubicación y respeta moderación/borrado. */
export function finishedActivityFilter(now: Date): Filter<ActivityDocument> {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid lifecycle timestamp is required.');
  return { type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] }, status: 'ACTIVE', deletedAt: null,
    startAt: { $type: 'date' }, endAt: { $type: 'date', $lte: now }, $expr: { $gt: ['$endAt', '$startAt'] } };
}

/** La actualización condicional recupera atrasos y tolera reintentos o varios workers. */
export async function finishEndedActivities(now = new Date()): Promise<number> {
  const result = await getMongoDb().collection<ActivityDocument>('activities').updateMany(
    finishedActivityFilter(now), { $set: { status: 'FINISHED', updatedAt: now } });
  return result.modifiedCount;
}
