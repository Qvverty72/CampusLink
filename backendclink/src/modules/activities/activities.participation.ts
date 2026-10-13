import { ApiError } from '../../services/apiError.js';
import type { ActivityParticipationDocument, ActivityParticipationDto } from './activities.types.js';
import type { ObjectId } from 'mongodb';

export function initialActivityParticipation(activityId: ObjectId, campusId: string, userId: string, at: Date): ActivityParticipationDocument {
  return { activityId, campusId, userId, status: 'JOINED', joinedAt: at, updatedAt: at,
    firstJoinedAt: at, lastJoinedAt: at, lastLeftAt: null, joinCount: 1, leaveCount: 0, historyComplete: true };
}

export function participationDto(document: ActivityParticipationDocument, campusId: string,
  activityId: string, userId: string): ActivityParticipationDto {
  if (document.campusId !== campusId || document.userId !== userId
    || document.activityId?.toHexString?.() !== activityId || !['JOINED', 'LEFT'].includes(document.status)
    || !(document.joinedAt instanceof Date) || !Number.isFinite(document.joinedAt.getTime())
    || !(document.updatedAt instanceof Date) || !Number.isFinite(document.updatedAt.getTime())) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participation data is invalid.');
  }
  return { campusId, activityId, status: document.status, canLeave: document.status === 'JOINED',
    joinedAt: document.joinedAt.toISOString(), updatedAt: document.updatedAt.toISOString() };
}
