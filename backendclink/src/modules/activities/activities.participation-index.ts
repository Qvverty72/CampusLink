import type { Db } from 'mongodb';
import { ApiError } from '../../services/apiError.js';

/** All activity writes depend on this full unique index, including organizer creation. */
export async function requireParticipationIndex(db: Db): Promise<void> {
  const indexes = await db.collection('activity_participation').indexes();
  if (!indexes.some(index => index.unique && Object.keys(index.key).length === 2
    && index.key.activityId === 1 && index.key.userId === 1 && !index.partialFilterExpression && !index.sparse)) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participation uniqueness is not configured.');
  }
}
