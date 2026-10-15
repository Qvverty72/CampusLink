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
export interface PhysicalgoodsReminderDto {
  id:string;
  publicationId:string;
  type:'PHYSICAL_PUBLICATION_CLOSE_REMINDER';
  title:string;
  message:string;
  createdAt:string;
  readAt:string|null;
}
export interface NotificationPage { items: (ActivityNotificationDto|PhysicalgoodsReminderDto)[]; nextCursor: string | null }
