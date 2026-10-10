import { getMongoDb } from '../../config/mongodb.js';
import { mongoClient } from '../../database/mongodb/client.js';
import { ApiError } from '../../services/apiError.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity } from './activities.policy.js';
import { requireParticipationIndex } from './activities.participation-index.js';
import { publicationNotifications } from './activities.notifications.js';
import type { ActivityDocument, ActivityDto, ActivityParticipationDocument } from './activities.types.js';

/** Publish and enroll the creator atomically, rechecking the location in the transaction snapshot. */
export async function insertActivity(document: ActivityDocument): Promise<ActivityDto> {
  const db = getMongoDb();
  await requireParticipationIndex(db);
  const result = await mongoClient.withSession(session => session.withTransaction(async () => {
    const now = new Date(Math.max(document.createdAt.getTime(), Date.now()));
    const map = await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId: document.campusId, status: 'ACTIVE' }, { session });
    const activity = map && toVisibleActivity(document, document.campusId, now, spatialBuildings(map));
    if (!activity) throw new ApiError(400, 'VALIDATION_ERROR', 'Activity dates or location are no longer available.');
    const persisted = { ...document, createdAt: now, updatedAt: now, notificationEvents: publicationNotifications(document, now) };
    await db.collection<ActivityDocument>('activities').insertOne(persisted, { session });
    await db.collection<ActivityParticipationDocument>('activity_participation').insertOne({
      activityId: document._id, campusId: document.campusId, userId: document.createdByUserId,
      status: 'JOINED', joinedAt: now, updatedAt: now,
    }, { session });
    return activity;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity creation was not confirmed.');
  return result;
}
