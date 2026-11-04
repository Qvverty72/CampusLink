import type { ActivityChangeDocument } from '../types/activities.edit.types.js';
import type { ActivityDocument, ActivityParticipationDocument } from '../types/activities.types.js';

export interface ActivityNotificationEvent {
  key: string;
  type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED' | 'OFFICIAL_EVENT_STARTED';
  title: string;
  reasons: ActivityChangeDocument['notificationReasons'];
  occurredAt: Date;
  status: 'PENDING' | 'DELIVERED';
  deliveredAt?: Date;
  recipientIds?: string[];
  message?: string;
  deliveries?: { recipientId: string; activityId: string; dateCount: number; reasons: ActivityChangeDocument['notificationReasons'] }[];
}

export function publicationNotifications(activity: ActivityDocument, now: Date): ActivityNotificationEvent[] {
  // El worker anuncia las series cuando inicia cada ocurrencia, incluida la primera.
  if (activity.seriesId) return [];
  return activity.type === 'OFFICIAL_EVENT' ? [{ key: `activity:${activity._id.toHexString()}:published`,
    type: 'OFFICIAL_EVENT_PUBLISHED', title: activity.title, reasons: [], occurredAt: now, status: 'PENDING' }] : [];
}

export function groupedChangeNotification(histories: ActivityChangeDocument[], recipients: Map<string, string[]>): ActivityNotificationEvent {
  const first = histories[0];
  const deliveries = new Map<string, NonNullable<ActivityNotificationEvent['deliveries']>[number]>();
  const ordered = [...histories].sort((a, b) => a.after.startAt.getTime() - b.after.startAt.getTime()
    || a.activityId.toHexString().localeCompare(b.activityId.toHexString()));
  for (const history of ordered) {
    for (const recipientId of new Set(recipients.get(history.activityId.toHexString()) ?? [])) {
      const previous = deliveries.get(recipientId);
      deliveries.set(recipientId, { recipientId, activityId: previous?.activityId ?? history.activityId.toHexString(),
        dateCount: (previous?.dateCount ?? 0) + 1,
        reasons: [...new Set([...(previous?.reasons ?? []), ...history.notificationReasons])] });
    }
  }
  return { key: `operation:${first.operationId.toHexString()}:changed`, type: 'ACTIVITY_CHANGED',
    title: first.after.title, reasons: [...new Set(histories.flatMap(history => history.notificationReasons))],
    occurredAt: first.changedAt, status: 'PENDING',
    recipientIds: [...deliveries.keys()], deliveries: [...deliveries.values()] };
}

export function occurrencePublicationNotification(activity: ActivityDocument): ActivityNotificationEvent {
  return { key: `activity:${activity._id.toHexString()}:started`, type: 'OFFICIAL_EVENT_PUBLISHED',
    title: activity.title, reasons: [], occurredAt: activity.startAt, status: 'PENDING' };
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
