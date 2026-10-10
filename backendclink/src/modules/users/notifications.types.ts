export interface ActivityNotificationDto {
  id: string;
  activityId: string;
  type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED';
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationPage { items: ActivityNotificationDto[]; nextCursor: string | null }
