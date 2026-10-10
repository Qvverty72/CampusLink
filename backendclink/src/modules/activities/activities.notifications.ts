import type { ActivityChangeDocument } from './activities.edit.types.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';

export interface ActivityNotificationEvent {
  key: string;
  type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED';
  title: string;
  reasons: ActivityChangeDocument['notificationReasons'];
  occurredAt: Date;
  status: 'PENDING' | 'DELIVERED';
  deliveredAt?: Date;
  recipientIds?: string[];
}

export function publicationNotifications(activity: ActivityDocument, now: Date): ActivityNotificationEvent[] {
  return activity.type === 'OFFICIAL_EVENT' ? [{ key: `activity:${activity._id.toHexString()}:published`,
    type: 'OFFICIAL_EVENT_PUBLISHED', title: activity.title, reasons: [], occurredAt: now, status: 'PENDING' }] : [];
}

export function changeNotification(history: ActivityChangeDocument, recipientIds: string[]): ActivityNotificationEvent {
  return { key: `activity:${history.activityId.toHexString()}:revision:${history.revision}`,
    type: 'ACTIVITY_CHANGED', title: history.after.title, reasons: history.notificationReasons,
    occurredAt: history.changedAt, status: 'PENDING', recipientIds };
}

export function participantsAtChange(rows: Pick<ActivityParticipationDocument, 'userId' | 'status'>[], creatorId: string): string[] {
  const ids = rows.filter(row => row.status === 'JOINED').map(row => row.userId);
  if (!rows.some(row => row.userId === creatorId)) ids.push(creatorId);
  return [...new Set(ids)];
}
