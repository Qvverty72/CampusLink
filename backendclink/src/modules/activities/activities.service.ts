import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { getAuthorizedActiveMap, type ActiveMapLookup } from '../maps/map.service.js';
import { ApiError } from '../../services/apiError.js';
import { hasActivityLocation, spatialBuildings } from './activities.location.js';
import { toVisibleActivity } from './activities.policy.js';
import type { ActivityDocument, ActivityDto, ActivityParticipationDocument, ActivityQuery, ActivitySeriesDocument } from './activities.types.js';

export interface ActivityDependencies {
  getActiveMap?: ActiveMapLookup;
  findActivities?: (campusId: string, query: ActivityQuery, now: Date) => Promise<ActivityDocument[]>;
  now?: () => Date;
  findActivity?: (campusId: string, activityId: string, now: Date) => Promise<ActivityDocument | null>;
  findParticipation?: (campusId: string, activityId: string, userId: string) => Promise<ActivityParticipationDocument | null>;
  findOrganizer?: (userId: string) => Promise<{ name: string } | null>;
  registerParticipation?: (campusId: string, activityId: string, userId: string, now: Date) => Promise<void>;
  createActivity?: (document: ActivityDocument) => Promise<ActivityDto>;
  createSeries?: (series: ActivitySeriesDocument, documents: ActivityDocument[]) => Promise<ActivityDto[]>;
  findSeries?: (campusId: string, seriesId: string) => Promise<ActivitySeriesDocument | null>;
  findSeriesOccurrences?: (campusId: string, seriesId: string, now: Date) => Promise<ActivityDocument[]>;
}

export async function getActivities(auth: VerifiedAuthConnection, query: ActivityQuery, dependencies: ActivityDependencies = {}): Promise<ActivityDto[]> {
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const buildings = spatialBuildings(map);
  if (!hasActivityLocation(buildings, query)) throw new ApiError(404, 'NOT_FOUND', 'Activity location not found.');
  const now = dependencies.now?.() ?? new Date();
  const lookup = dependencies.findActivities ?? (await import('./activities.repository.js')).findVisibleActivities;
  const documents = await lookup(auth.campusId, query, now);
  const result = documents.flatMap((document): ActivityDto[] => {
    const activity = toVisibleActivity(document, auth.campusId, now, buildings, query);
    return activity ? [activity] : [];
  });
  return result.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}
