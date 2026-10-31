import type { VerifiedAuthConnection } from '../auth/types/auth.types.js';
import { getAuthorizedActiveMap, type ActiveMapLookup } from '../maps/map.service.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { hasActivityLocation, spatialBuildings } from './activities.location.js';
import { toVisibleActivity } from './activities.policy.js';
import { validActivityCreators } from './activities.references.service.js';
import type { ActivityDocument, ActivityDto, ActivityParticipationDocument, ActivityParticipationDto, ActivityCreatorRecord, ActivityQuery, ActivitySeriesDocument, ActivityCreationOptions } from './activities.types.js';
import type { ActivityParticipantsQuery, ActivityParticipantsRecords, ActivityDeletionResult } from './activities.types.js';

export interface ActivityDependencies {
  getActiveMap?: ActiveMapLookup;
  findActivities?: (campusId: string, query: ActivityQuery, now: Date) => Promise<ActivityDocument[]>;
  now?: () => Date;
  findActivity?: (campusId: string, activityId: string, now: Date) => Promise<ActivityDocument | null>;
  findParticipation?: (campusId: string, activityId: string, userId: string) => Promise<ActivityParticipationDocument | null>;
  findOrganizer?: (userId: string, campusId: string) => Promise<{ name: string } | null>;
  findValidCreators?: (campusId: string, userIds: string[]) => Promise<Map<string, string>>;
  registerParticipation?: (campusId: string, activityId: string, userId: string, now: Date, operationId?: string) => Promise<void>;
  recordView?: (campusId: string, activityId: string, userId: string, now: Date, operationId: string) => Promise<void>;
  findCreatedActivity?: (campusId: string, activityId: string, userId: string) => Promise<ActivityCreatorRecord | null>;
  withdrawParticipation?: (campusId: string, activityId: string, userId: string, now: Date, operationId?: string) => Promise<ActivityParticipationDto>;
  createActivity?: (document: ActivityDocument, options?: ActivityCreationOptions) => Promise<ActivityDto>;
  findActiveCommunityActivity?: (campusId: string, userId: string, now: Date) => Promise<ActivityDocument | null>;
  createSeries?: (series: ActivitySeriesDocument, documents: ActivityDocument[]) => Promise<ActivityDto[]>;
  findSeries?: (campusId: string, seriesId: string) => Promise<ActivitySeriesDocument | null>;
  findSeriesOccurrences?: (campusId: string, seriesId: string, now: Date) => Promise<ActivityDocument[]>;
  findParticipants?: (document: ActivityDocument, query: ActivityParticipantsQuery, currentUserId: string) => Promise<ActivityParticipantsRecords>;
  findParticipantNames?: (campusId: string, userIds: string[]) => Promise<Map<string, string>>;
  deleteActivity?: (auth: VerifiedAuthConnection, activityId: string, expectedRevision: number, now: Date) => Promise<ActivityDeletionResult>;
}

/**
 * Lista actividades visibles del campus actual y valida sus ubicaciones contra el mapa activo.
 * Los filtros se aplican en MongoDB y se comprueban de nuevo al construir el DTO.
 */
export async function getActivities(auth: VerifiedAuthConnection, query: ActivityQuery, dependencies: ActivityDependencies = {}): Promise<ActivityDto[]> {
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const buildings = spatialBuildings(map);
  if (!hasActivityLocation(buildings, query)) throw new ApiError(404, 'NOT_FOUND', 'Activity location not found.');
  const now = dependencies.now?.() ?? new Date();
  const lookup = dependencies.findActivities ?? (await import('./activities.repository.js')).findVisibleActivities;
  const documents = await lookup(auth.campusId, query, now);
  const creators = await validActivityCreators(auth, documents.filter(document =>
    toVisibleActivity(document, auth.campusId, now, buildings, query)).map(document => document.createdByUserId), dependencies);
  const result = documents.flatMap((document): ActivityDto[] => {
    if (!creators.has(document.createdByUserId)) return [];
    const activity = toVisibleActivity(document, auth.campusId, now, buildings, query);
    return activity ? [activity] : [];
  });
  return result.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}
