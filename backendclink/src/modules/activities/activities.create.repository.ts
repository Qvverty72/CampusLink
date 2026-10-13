import { getMongoDb } from '../../config/mongodb.js';
import { mongoClient } from '../../database/mongodb/client.js';
import { ApiError } from '../../services/apiError.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity, activeCommunityActivityFilter, COMMUNITY_ACTIVITY_LIMIT_MESSAGE } from './activities.policy.js';
import { requireParticipationIndex } from './activities.participation-index.js';
import { publicationNotifications } from './activities.notifications.js';
import { initialActivityParticipation } from './activities.participation.js';
import { appendActivityInteraction, activityInteractionKey } from './activities.interactions.js';
import type { ActivityDocument, ActivityDto, ActivityParticipationDocument, ActivityCreationOptions } from './activities.types.js';

export async function findActiveCommunityActivity(campusId: string, userId: string, now: Date): Promise<ActivityDocument | null> {
  return getMongoDb().collection<ActivityDocument>('activities').findOne(activeCommunityActivityFilter(campusId, userId, now));
}

/** Publish and enroll the creator atomically, rechecking the location in the transaction snapshot. */
export async function insertActivity(document: ActivityDocument, options: ActivityCreationOptions = {}): Promise<ActivityDto> {
  const db = getMongoDb();
  await requireParticipationIndex(db);
  const result = await mongoClient.withSession(session => session.withTransaction(async () => {
    const now = new Date(Math.max(document.createdAt.getTime(), Date.now()));
    const maps = db.collection<CampusMapDocument>('campus_maps');
    const limited = document.type === 'COMMUNITY_ACTIVITY' && options.limitActiveCommunity === true;
    // A shared write forces competing snapshots to retry before checking the creator's quota.
    // Counting alone permits write skew: different inserted activity IDs do not conflict.
    const map = limited
      ? await maps.findOneAndUpdate({ campusId: document.campusId, status: 'ACTIVE' },
        { $inc: { communityActivityCreationRevision: 1 } }, { session, returnDocument: 'after' })
      : await maps.findOne({ campusId: document.campusId, status: 'ACTIVE' }, { session });
    const activity = map && toVisibleActivity(document, document.campusId, now, spatialBuildings(map));
    if (!activity) throw new ApiError(400, 'VALIDATION_ERROR', 'Activity dates or location are no longer available.');
    if (limited && await db.collection<ActivityDocument>('activities').findOne(
      activeCommunityActivityFilter(document.campusId, document.createdByUserId, now), { session })) {
      throw new ApiError(409, 'CONFLICT', COMMUNITY_ACTIVITY_LIMIT_MESSAGE);
    }
    const persisted = { ...document, createdAt: now, updatedAt: now, notificationEvents: publicationNotifications(document, now) };
    await db.collection<ActivityDocument>('activities').insertOne(persisted, { session });
    await db.collection<ActivityParticipationDocument>('activity_participation').insertOne(
      initialActivityParticipation(document._id, document.campusId, document.createdByUserId, now), { session });
    await appendActivityInteraction(db, { activityId: document._id, campusId: document.campusId, userId: document.createdByUserId,
      type: 'JOINED', occurredAt: now, provenance: 'LIVE', eventKey: activityInteractionKey(document._id, document.campusId, document.createdByUserId, 'JOINED', 1) }, session);
    return activity;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity creation was not confirmed.');
  return result;
}
