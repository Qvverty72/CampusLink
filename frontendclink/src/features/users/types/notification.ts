/** Vista pública de una notificación de actividad recibida por el usuario. */
export interface ActivityNotification {
  id: string; activityId: string; seriesId?: string; type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED' | 'OFFICIAL_EVENT_STARTED';
  title: string; message: string; createdAt: string; readAt: string | null;
}
/** Aviso de cierre ligado a una publicación física propia. */
export interface PhysicalgoodsReminder {
  id:string;publicationId:string;type:'PHYSICAL_PUBLICATION_CLOSE_REMINDER';
  title:string;message:string;createdAt:string;readAt:string|null;
}
export type UserNotification=ActivityNotification|PhysicalgoodsReminder;
/** Página de notificaciones; `nextCursor` nulo indica que no hay página siguiente. */
export interface NotificationPage { items: UserNotification[]; nextCursor: string | null }
