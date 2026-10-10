import type { Filter } from 'mongodb';
import { resolveActivityLocation, spatialBuildings } from './activities.location.js';
import type { ActivityDocument, ActivityDto, ActivityQuery } from './activities.types.js';

/** The same publication policy applies to lists, direct detail and registration. */
export function visibleActivityFilter(campusId: string, now: Date): Filter<ActivityDocument> {
  return { campusId, status: 'ACTIVE', visibility: 'PUBLIC',
    type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] }, endAt: { $gt: now } };
}

export function toVisibleActivity(document: ActivityDocument, campusId: string, now: Date,
  buildings: ReturnType<typeof spatialBuildings>, query: ActivityQuery = {}): ActivityDto | null {
  if (document.campusId !== campusId || document.status !== 'ACTIVE' || document.visibility !== 'PUBLIC'
    || !['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'].includes(document.type)
    || !(document.startAt instanceof Date) || !(document.endAt instanceof Date)
    || !Number.isFinite(document.startAt.getTime()) || !Number.isFinite(document.endAt.getTime())
    || document.endAt <= now || document.endAt <= document.startAt
    || typeof document.title !== 'string' || typeof document.description !== 'string'
    || !document._id || typeof document._id.toHexString !== 'function') return null;
  const location = resolveActivityLocation(buildings, document.location);
  if (!location || (query.buildingKey && query.buildingKey !== location.buildingKey)
    || (query.floorKey && query.floorKey !== location.floorKey)
    || (query.poiKey && query.poiKey !== location.poiKey)) return null;
  return { id: document._id.toHexString(), campusId: document.campusId,
    title: document.title, description: document.description,
    type: document.type as ActivityDto['type'], status: 'ACTIVE',
    startAt: document.startAt.toISOString(), endAt: document.endAt.toISOString(), location };
}
