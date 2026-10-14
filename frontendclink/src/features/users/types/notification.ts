/** Vista pública de una notificación de actividad recibida por el usuario. */
export interface ActivityNotification {
  id: string; activityId: string; seriesId?: string; type: 'OFFICIAL_EVENT_PUBLISHED' | 'ACTIVITY_CHANGED' | 'OFFICIAL_EVENT_STARTED';
  title: string; message: string; createdAt: string; readAt: string | null;
}
/** Página de notificaciones; `nextCursor` nulo indica que no hay página siguiente. */
export interface NotificationPage { items: ActivityNotification[]; nextCursor: string | null }
