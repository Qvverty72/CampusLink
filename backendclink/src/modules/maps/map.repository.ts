import type { WithId } from 'mongodb';

import { getMongoDb } from '../../config/mongodb.js';
import type { CampusMapDocument } from './map.types.js';

const CAMPUS_MAPS_COLLECTION = 'campus_maps';

export async function findActiveMapByCampusId(
  campusId: string,
): Promise<WithId<CampusMapDocument> | null> {
  return getMongoDb()
    .collection<CampusMapDocument>(CAMPUS_MAPS_COLLECTION)
    .findOne({ campusId, status: 'ACTIVE' });
}
