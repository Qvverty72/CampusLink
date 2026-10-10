import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { getAuthorizedActiveMap } from '../maps/map.service.js';
import { ApiError } from '../../services/apiError.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity } from './activities.policy.js';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityDetailDto } from './activities.types.js';
import type { ActivityParticipationDto } from './activities.types.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import { participationDto } from './activities.participation.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalBanner(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export async function getActivityDetail(auth: VerifiedAuthConnection, activityId: string,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid activity ID is required.');
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const now = dependencies.now?.() ?? new Date();
  const find = dependencies.findActivity ?? (await import('./activities.detail.repository.js')).findVisibleActivity;
  const document = await find(auth.campusId, activityId, now);
  const activity = document && toVisibleActivity(document, auth.campusId, now, spatialBuildings(map));
  if (!activity || activity.id !== activityId.toLowerCase()) throw new ApiError(404, 'NOT_FOUND', 'Activity not available.');
  const participationLookup = dependencies.findParticipation ?? (await import('./activities.detail.repository.js')).findOwnParticipation;
  const organizerLookup = async () => {
    if (document.createdByUserId === auth.userId) return { name: auth.profile.nombre_completo };
    if (typeof document.createdByUserId !== 'string' || !uuid.test(document.createdByUserId)) return null;
    const lookup = dependencies.findOrganizer ?? (await import('./activities.detail.repository.js')).findActivityOrganizer;
    return lookup(document.createdByUserId);
  };
  const [participation, organizer] = await Promise.all([
    participationLookup(auth.campusId, activity.id, auth.userId), organizerLookup(),
  ]);
  if (participation && (participation.campusId !== auth.campusId || participation.userId !== auth.userId
    || participation.activityId?.toHexString?.() !== activity.id || !['JOINED', 'LEFT'].includes(participation.status))) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participation data is invalid.');
  }
  const status = participation?.status ?? (document.createdByUserId === auth.userId ? 'JOINED' : 'NOT_JOINED');
  const bannerUrl = optionalBanner(document.bannerUrl);
  const category = typeof document.category === 'string' ? document.category.trim() : undefined;
  const tags = Array.isArray(document.tags) ? document.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()) : [];
  return { ...activity, organizer: organizer?.name?.trim() ? { name: organizer.name.trim() } : null,
    ...(document.createdByUserId === auth.userId && Number.isSafeInteger(document.editRevision ?? 0) && (document.editRevision ?? 0) >= 0
      ? { editing: { revision: document.editRevision ?? 0, canEditUpcoming: !!activity.series && document.startAt > now } } : {}),
    participation: { status, canJoin: status !== 'JOINED' },
    ...(bannerUrl ? { bannerUrl } : {}), ...(category ? { category } : {}), ...(tags.length ? { tags } : {}) };
}

export async function joinActivity(auth: VerifiedAuthConnection, activityId: string,
  dependencies: ActivityDependencies = {}): Promise<ActivityDetailDto> {
  const detail = await getActivityDetail(auth, activityId, dependencies);
  if (!detail.participation.canJoin) return detail;
  const register = dependencies.registerParticipation ?? (await import('./activities.detail.repository.js')).registerActivityParticipation;
  await register(auth.campusId, detail.id, auth.userId, dependencies.now?.() ?? new Date());
  // Return server-owned participation, never an optimistic client-supplied state.
  return getActivityDetail(auth, detail.id, dependencies);
}

function authorizeParticipation(auth: VerifiedAuthConnection, activityId: string): string {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid activity ID is required.');
  requireCampusCapability(auth, auth.campusId, 'general');
  return activityId.toLowerCase();
}

export async function getOwnActivityParticipation(auth: VerifiedAuthConnection, activityId: string,
  dependencies: ActivityDependencies = {}): Promise<ActivityParticipationDto> {
  const id = authorizeParticipation(auth, activityId);
  const find = dependencies.findParticipation ?? (await import('./activities.detail.repository.js')).findOwnParticipation;
  const current = await find(auth.campusId, id, auth.userId);
  if (current) return participationDto(current, auth.campusId, id, auth.userId);
  // Older activities count the creator even when they have no explicit participation row.
  const findCreated = dependencies.findCreatedActivity ?? (await import('./activities.detail.repository.js')).findCreatedActivity;
  const activity = await findCreated(auth.campusId, id, auth.userId);
  if (activity) {
    return participationDto({ campusId: activity.campusId, activityId: activity._id,
      userId: activity.createdByUserId, status: 'JOINED', joinedAt: activity.createdAt, updatedAt: activity.createdAt },
    auth.campusId, id, auth.userId);
  }
  return { campusId: auth.campusId, activityId: id, status: 'NOT_JOINED' };
}

export async function leaveActivity(auth: VerifiedAuthConnection, activityId: string,
  dependencies: ActivityDependencies = {}): Promise<ActivityParticipationDto> {
  const id = authorizeParticipation(auth, activityId);
  const withdraw = dependencies.withdrawParticipation ?? (await import('./activities.detail.repository.js')).withdrawActivityParticipation;
  return withdraw(auth.campusId, id, auth.userId, dependencies.now?.() ?? new Date());
}
