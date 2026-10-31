import { MongoServerError, ObjectId } from 'mongodb';
import { getMongoDB as getMongoDb } from '../../database/mongodb/client.js';
import { mongoClient } from '../../database/mongodb/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { ActivityDocument } from './activities.types.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { toVisibleActivity, visibleActivityFilter } from './activities.policy.js';
import { spatialBuildings } from './activities.location.js';
import { appendActivityInteraction, activityInteractionKey, hasActivityInteraction } from './activities.interactions.js';

/** Registra una vista idempotente solo si actividad y ubicación siguen visibles en la misma instantánea. */
export async function recordActivityView(campusId: string, activityId: string, userId: string, now: Date, operationId: string): Promise<void> {
  const db = getMongoDb(); const id = new ObjectId(activityId);
  const eventKey = activityInteractionKey(id, campusId, userId, 'VIEWED', 0, operationId);
  try {
    await mongoClient.withSession(session => session.withTransaction(async () => {
      if (await hasActivityInteraction(db, eventKey, id, campusId, userId, 'VIEWED', session)) return;
      const at = new Date(Math.max(now.getTime(), Date.now()));
      const activity = await db.collection<ActivityDocument>('activities').findOne({ ...visibleActivityFilter(campusId, at), _id: id }, { session });
      const map = await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId, status: 'ACTIVE' }, { session });
      if (!activity || !map || !toVisibleActivity(activity, campusId, at, spatialBuildings(map))) {
        throw new ApiError(404, 'NOT_FOUND', 'La actividad no está disponible.');
      }
      await appendActivityInteraction(db, { activityId: id, campusId, userId, type: 'VIEWED', occurredAt: at,
        eventKey, provenance: 'LIVE' }, session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000
      && await hasActivityInteraction(db, eventKey, id, campusId, userId, 'VIEWED')) return;
    throw error;
  }
}
