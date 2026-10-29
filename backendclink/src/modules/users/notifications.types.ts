import type { ActivityDto } from '../activities/activities.types.js';

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
interface ResourceNotificationBase {
  id: string; publicationId: string; resourceType: 'FISICO' | 'DIGITAL';
  title: string; message: string; createdAt: string; readAt: string | null;
}
export interface ResourceRequestNotificationDto extends ResourceNotificationBase {
  type: 'RESOURCE_REQUEST_RECEIVED' | 'RESOURCE_UPDATED'; requestId: string;
}
export interface ResourceTransactionNotificationDto extends ResourceNotificationBase {
  type: 'RESOURCE_REQUEST_ACCEPTED' | 'COORDINACION_RECURSO'; transactionId: string;
}
export type UserNotificationDto = ActivityNotificationDto | PhysicalgoodsReminderDto | ResourceRequestNotificationDto | ResourceTransactionNotificationDto;
export interface NotificationPage { items: UserNotificationDto[]; nextCursor: string | null }

/** Datos públicos del cambio concreto anunciado; nunca el historial administrativo. */
export interface NotificationActivitySnapshot {
  title: string; description: string; startAt: string; endAt: string;
  location: ActivityDto['location'] | null;
}
export interface NotificationActivityChangeDto {
  notificationId: string; activityId: string; title: string;
  before: NotificationActivitySnapshot; after: NotificationActivitySnapshot;
}
