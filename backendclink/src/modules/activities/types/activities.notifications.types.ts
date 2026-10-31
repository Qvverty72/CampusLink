import type { ActivityNotificationEvent } from '../domain/activities.notifications.js';


export interface PendingActivityNotification {
  activityId: string;
  campusId: string;
  event: ActivityNotificationEvent;
  creatorId: string;
  createdAt: Date;
}
