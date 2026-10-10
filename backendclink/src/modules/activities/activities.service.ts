import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { getAuthorizedActiveMap, type ActiveMapLookup } from '../maps/map.service.js';
import { ApiError } from '../../services/apiError.js';
import { hasActivityLocation, resolveActivityLocation, spatialBuildings } from './activities.location.js';
import type { ActivityDocument, ActivityDto, ActivityQuery } from './activities.types.js';

export interface ActivityDependencies {
  getActiveMap?: ActiveMapLookup;
  findActivities?: (campusId: string, query: ActivityQuery, now: Date) => Promise<ActivityDocument[]>;
  now?: () => Date;
}

export async function getActivities(auth: VerifiedAuthConnection, query: ActivityQuery, dependencies: ActivityDependencies = {}): Promise<ActivityDto[]> {
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const buildings = spatialBuildings(map);
  if (!hasActivityLocation(buildings, query)) throw new ApiError(404, 'NOT_FOUND', 'Activity location not found.');
  const now = dependencies.now?.() ?? new Date();
  const lookup = dependencies.findActivities ?? (await import('./activities.repository.js')).findVisibleActivities;
  const documents = await lookup(auth.campusId, query, now);
  const result = documents.flatMap((document): ActivityDto[] => {
    // Defense in depth also prevents a malformed document or injected repository from escaping policy.
    if (document.campusId !== auth.campusId || document.status !== 'ACTIVE' || document.visibility !== 'PUBLIC'
      || !['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'].includes(document.type)
      || !(document.startAt instanceof Date) || !(document.endAt instanceof Date)
      || !Number.isFinite(document.startAt.getTime()) || !Number.isFinite(document.endAt.getTime())
      || document.endAt <= now || document.endAt <= document.startAt
      || typeof document.title !== 'string' || typeof document.description !== 'string'
      || !document._id || typeof document._id.toHexString !== 'function') return [];
    const location = resolveActivityLocation(buildings, document.location);
    if (!location || (query.buildingKey && query.buildingKey !== location.buildingKey)
      || (query.floorKey && query.floorKey !== location.floorKey)
      || (query.poiKey && query.poiKey !== location.poiKey)) return [];
    return [{ id: document._id.toHexString(), campusId: document.campusId,
      title: document.title, description: document.description,
      type: document.type as ActivityDto['type'], status: 'ACTIVE',
      startAt: document.startAt.toISOString(), endAt: document.endAt.toISOString(), location }];
  });
  return result.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}
