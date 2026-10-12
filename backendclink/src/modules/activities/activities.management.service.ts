import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { requireResourceOwner, requireCampusCapability } from '../auth/auth.authorization.js';
import { activityIntegrity } from './activities.integrity.js';
import { documentOperation } from '../../services/document-references.js';
import { ApiError } from '../../services/apiError.js';
import { getAvailableActivity } from './activities.detail.service.js';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityParticipantsQuery, ActivityParticipantsPage, ActivityDeletionResult } from './activities.types.js';

export async function getActivityParticipants(auth: VerifiedAuthConnection, activityId: string,
  query: ActivityParticipantsQuery, dependencies: ActivityDependencies = {}): Promise<ActivityParticipantsPage> {
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 100000
    || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 20) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid pagination.');
  }
  const { document, activity } = await getAvailableActivity(auth, activityId, dependencies);
  const find = dependencies.findParticipants ?? (await import('./activities.management.repository.js')).findActivityParticipants;
  const page = await find(document, query, auth.userId);
  if (!Number.isSafeInteger(page.total) || page.total < 0 || page.pageSize !== query.pageSize
    || !Number.isSafeInteger(page.page) || page.page < 1 || page.page > Math.max(1, Math.ceil(page.total / page.pageSize))
    || page.rows.length > page.pageSize || page.rows.some(row => !row.key || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.userId))) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Participant data is invalid.');
  }
  const lookup = dependencies.findParticipantNames ?? (await import('./activities.management.repository.js')).findParticipantNames;
  const names = page.rows.length ? await lookup(auth.campusId, page.rows.map(row => row.userId)) : new Map<string, string>();
  return { activityId: activity.id, campusId: auth.campusId, page: page.page, pageSize: page.pageSize, total: page.total,
    participants: page.rows.map(row => ({ key: row.key, name: names.get(row.userId)?.trim() || null,
      isCurrentUser: row.userId === auth.userId })) };
}

export async function deleteOwnActivity(auth: VerifiedAuthConnection, activityId: string, expectedRevision: number,
  dependencies: ActivityDependencies = {}): Promise<ActivityDeletionResult> {
  return activityIntegrity.withActor(auth, 'general', async current => {
    auth = current;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid expected revision is required.');
    }
    const { document, activity, now } = await getAvailableActivity(auth, activityId, dependencies);
    requireResourceOwner(auth, document.createdByUserId);
    if (document.type === 'OFFICIAL_EVENT') requireCampusCapability(auth, document.campusId, 'officialActivities');
    if ((document.editRevision ?? 0) !== expectedRevision) throw new ApiError(409, 'CONFLICT', 'La actividad cambió. Recarga la ficha antes de eliminar.');
    const commit = dependencies.deleteActivity ?? (await import('./activities.management.repository.js')).commitActivityDeletion;
    return documentOperation(() => commit(auth, activity.id, expectedRevision, now));
  });
}
