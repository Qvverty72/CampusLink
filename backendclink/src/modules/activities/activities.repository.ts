import { getMongoDb } from '../../config/mongodb.js';
import { visibleActivityFilter } from './activities.policy.js';
import type { ActivityDocument, ActivityQuery } from './activities.types.js';

export async function findVisibleActivities(campusId: string, query: ActivityQuery, now: Date): Promise<ActivityDocument[]> {
  const filter = visibleActivityFilter(campusId, now);
  if (query.buildingKey) filter['location.buildingKey'] = query.buildingKey;
  if (query.floorKey) filter['location.floorKey'] = query.floorKey;
  if (query.poiKey) filter['location.poiKey'] = query.poiKey;
  // Spatial existence and POI visibility are additionally checked against the active map.
  return getMongoDb().collection<ActivityDocument>('activities').find(filter, {
    projection: { _id: 1, campusId: 1, title: 1, description: 1, type: 1, status: 1,
      visibility: 1, startAt: 1, endAt: 1, location: 1 },
  }).sort({ startAt: 1, _id: 1 }).toArray();
}
