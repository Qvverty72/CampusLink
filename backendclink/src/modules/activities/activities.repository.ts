import type { Filter } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import type { ActivityDocument, ActivityQuery } from './activities.types.js';

export async function findVisibleActivities(campusId: string, query: ActivityQuery, now: Date): Promise<ActivityDocument[]> {
  const filter: Filter<ActivityDocument> = {
    campusId, status: 'ACTIVE', visibility: 'PUBLIC',
    type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] },
    endAt: { $gt: now },
  };
  if (query.buildingKey) filter['location.buildingKey'] = query.buildingKey;
  if (query.floorKey) filter['location.floorKey'] = query.floorKey;
  if (query.poiKey) filter['location.poiKey'] = query.poiKey;
  // Spatial existence and POI visibility are additionally checked against the active map.
  return getMongoDb().collection<ActivityDocument>('activities').find(filter, {
    projection: { _id: 1, campusId: 1, title: 1, description: 1, type: 1, status: 1,
      visibility: 1, startAt: 1, endAt: 1, location: 1 },
  }).sort({ startAt: 1, _id: 1 }).toArray();
}
