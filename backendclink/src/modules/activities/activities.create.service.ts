import { ObjectId } from 'mongodb';
import { ApiError } from '../../services/apiError.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { getAuthorizedActiveMap } from '../maps/map.service.js';
import { resolveActivityLocation, spatialBuildings } from './activities.location.js';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityDetailDto, ActivityDocument, CreateCommunityActivityInput } from './activities.types.js';

export async function createCommunityActivity(auth: VerifiedAuthConnection, input: CreateCommunityActivityInput,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  if (!auth.profile.verificado_en || auth.profile.campus_id !== auth.campusId) {
    throw new ApiError(403, 'FORBIDDEN', 'A verified institutional account in the current campus is required.');
  }
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  if (!resolveActivityLocation(spatialBuildings(map), input.location)) throw new ApiError(400, 'VALIDATION_ERROR', 'Select an active location in your campus.');
  const now = dependencies.now?.() ?? new Date();
  if (input.endAt <= input.startAt || input.endAt <= now) throw new ApiError(400, 'VALIDATION_ERROR', 'Activity must end after start and still be current.');
  const document: ActivityDocument = {
    _id: new ObjectId(), campusId: auth.campusId, createdByUserId: auth.userId,
    title: input.title, description: input.description, startAt: input.startAt, endAt: input.endAt,
    location: input.location, type: 'COMMUNITY_ACTIVITY', status: 'ACTIVE', visibility: 'PUBLIC',
    participantCount: 1, createdAt: now, updatedAt: now,
  };
  const persist = dependencies.createActivity ?? (await import('./activities.create.repository.js')).insertCommunityActivity;
  const activity = await persist(document);
  return { ...activity, organizer: auth.profile.nombre_completo.trim() ? { name: auth.profile.nombre_completo.trim() } : null,
    participation: { status: 'JOINED', canJoin: false } };
}
