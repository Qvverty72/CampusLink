import { ObjectId } from 'mongodb';
import { ApiError } from '../../services/apiError.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import { getAuthorizedActiveMap } from '../maps/map.service.js';
import { resolveActivityLocation, spatialBuildings } from './activities.location.js';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityDetailDto, ActivityDocument, ActivityType, CreateActivityInput } from './activities.types.js';

export async function createCommunityActivity(auth: VerifiedAuthConnection, input: CreateActivityInput,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  return publishActivity(auth, input, 'COMMUNITY_ACTIVITY', dependencies);
}

/** Role alone is insufficient; the existing campus matrix includes the approved admin exception. */
export async function createOfficialEvent(auth: VerifiedAuthConnection, input: CreateActivityInput,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  return publishActivity(auth, input, 'OFFICIAL_EVENT', dependencies);
}

/** Shared authorization/preparation for single activities and recurring series. */
export async function prepareActivityDocument(auth: VerifiedAuthConnection, input: CreateActivityInput, type: ActivityType,
  dependencies: ActivityDependencies): Promise<ActivityDocument> {
  if (auth.profile.campus_id !== auth.campusId || (type === 'COMMUNITY_ACTIVITY' && !auth.profile.verificado_en)) {
    throw new ApiError(403, 'FORBIDDEN', 'A verified institutional account in the current campus is required.');
  }
  if (type === 'OFFICIAL_EVENT') {
    requireCampusCapability(auth, auth.campusId, 'officialActivities');
    if (!auth.profile.nombre_completo.trim()) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'The organizer profile is unavailable.');
  }
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  if (!resolveActivityLocation(spatialBuildings(map), input.location)) throw new ApiError(400, 'VALIDATION_ERROR', 'Select an active location in your campus.');
  const now = dependencies.now?.() ?? new Date();
  if (input.endAt <= input.startAt || input.endAt <= now) throw new ApiError(400, 'VALIDATION_ERROR', 'Activity must end after start and still be current.');
  return {
    _id: new ObjectId(), campusId: auth.campusId, createdByUserId: auth.userId,
    title: input.title, description: input.description, startAt: input.startAt, endAt: input.endAt,
    location: input.location, type, status: 'ACTIVE', visibility: 'PUBLIC',
    participantCount: 1, createdAt: now, updatedAt: now,
  };
}

/** Type is selected by the authorized entry point, never by the request body. */
async function publishActivity(auth: VerifiedAuthConnection, input: CreateActivityInput, type: ActivityType,
  dependencies: ActivityDependencies): Promise<ActivityDetailDto> {
  const document = await prepareActivityDocument(auth, input, type, dependencies);
  const persist = dependencies.createActivity ?? (await import('./activities.create.repository.js')).insertActivity;
  const activity = await persist(document);
  return createdActivityDetail(auth, activity);
}

export function createdActivityDetail(auth: VerifiedAuthConnection, activity: import('./activities.types.js').ActivityDto): ActivityDetailDto {
  return { ...activity, organizer: auth.profile.nombre_completo.trim() ? { name: auth.profile.nombre_completo.trim() } : null,
    participation: { status: 'JOINED', canJoin: false } };
}
