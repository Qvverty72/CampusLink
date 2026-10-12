export interface ActivityNotificationDto {
  id: string;
  activityId: string;
  seriesId?: string;
  type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED' | 'OFFICIAL_EVENT_STARTED';
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationPage { items: ActivityNotificationDto[]; nextCursor: string | null }
