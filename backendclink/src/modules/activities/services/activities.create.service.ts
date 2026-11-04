import { ObjectId } from 'mongodb';
import { ApiError } from '../../../shared/errors/api-error.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { requireCampusCapability, accountCapabilities } from '../../auth/domain/auth.authorization.js';
import { getAuthorizedActiveMap } from '../../maps/public.js';
import { resolveActivityLocation, spatialBuildings } from '../domain/activities.location.js';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityDetailDto, ActivityDocument, ActivityType, CreateActivityInput } from '../types/activities.types.js';
import type { CommunityActivityCreationAvailability } from '../types/activities.types.js';
import { COMMUNITY_ACTIVITY_LIMIT_MESSAGE } from '../domain/activities.policy.js';

/** Indica si el usuario puede publicar y, si no es oficial, si ya mantiene un cupo comunitario ocupado. */
export async function getCommunityActivityCreationAvailability(auth: VerifiedAuthConnection,
  dependencies: ActivityDependencies = {}): Promise<CommunityActivityCreationAvailability> {
  requireCampusCapability(auth, auth.campusId, 'general');
  if (auth.profile.campus_id !== auth.campusId || !auth.profile.verificado_en) {
    throw new ApiError(403, 'FORBIDDEN', 'A verified institutional account in the current campus is required.');
  }
  if (accountCapabilities(auth).officialActivities) return { campusId: auth.campusId, canCreate: true };
  const find = dependencies.findActiveCommunityActivity
    ?? (await import('../repositories/activities.create.repository.js')).findActiveCommunityActivity;
  const existing = await find(auth.campusId, auth.userId, dependencies.now?.() ?? new Date());
  return { campusId: auth.campusId, canCreate: !existing, ...(existing ? { message: COMMUNITY_ACTIVITY_LIMIT_MESSAGE } : {}) };
}

/** Publica una actividad comunitaria aplicando la autorización y el límite de cupo vigentes. */
export async function createCommunityActivity(auth: VerifiedAuthConnection, input: CreateActivityInput,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  return publishActivity(auth, input, 'COMMUNITY_ACTIVITY', dependencies);
}

/** El rol por sí solo no basta; la matriz de campus vigente también considera la excepción administrativa configurada. */
export async function createOfficialEvent(auth: VerifiedAuthConnection, input: CreateActivityInput,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  return publishActivity(auth, input, 'OFFICIAL_EVENT', dependencies);
}

/** Prepara un documento común a actividades únicas y series, verificando cuenta, permiso y ubicación. */
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

/** El tipo lo elige el punto de entrada autorizado, nunca el cuerpo de la solicitud. */
async function publishActivity(auth: VerifiedAuthConnection, input: CreateActivityInput, type: ActivityType,
  dependencies: ActivityDependencies): Promise<ActivityDetailDto> {
  const document = await prepareActivityDocument(auth, input, type, dependencies);
  const persist = dependencies.createActivity ?? (await import('../repositories/activities.create.repository.js')).insertActivity;
  const activity = await persist(document, {
    limitActiveCommunity: type === 'COMMUNITY_ACTIVITY' && !accountCapabilities(auth).officialActivities,
  });
  return createdActivityDetail(auth, activity);
}

export function createdActivityDetail(auth: VerifiedAuthConnection, activity: import('../types/activities.types.js').ActivityDto): ActivityDetailDto {
  return { ...activity, organizer: auth.profile.nombre_completo.trim() ? { name: auth.profile.nombre_completo.trim() } : null,
    participation: { status: 'JOINED', canJoin: false, canLeave: false } };
}
