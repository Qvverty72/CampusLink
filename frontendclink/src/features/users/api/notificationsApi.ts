import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';

import type { NotificationActivityChange, NotificationActivitySnapshot, NotificationPage } from '../types/notification';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consulta únicamente el cambio asociado al aviso, sin cargar el flujo del mapa. */
export async function fetchNotificationActivityChange(id: string, signal?: AbortSignal): Promise<NotificationActivityChange> {
  if (!uuid.test(id)) throw new Error('Notificación inválida.');
  const response = await authenticatedEnvelopeRequest<NotificationActivityChange>(`/api/v1/users/me/notifications/${id}/activity-change`, { signal });
  const value = response.data;
  const validSnapshot = (snapshot: NotificationActivitySnapshot | undefined) => snapshot
    && typeof snapshot.title === 'string' && typeof snapshot.description === 'string'
    && typeof snapshot.startAt === 'string' && typeof snapshot.endAt === 'string'
    && Number.isFinite(Date.parse(snapshot.startAt)) && Date.parse(snapshot.endAt) > Date.parse(snapshot.startAt)
    && (snapshot.location === null || (snapshot.location && typeof snapshot.location.buildingKey === 'string'
      && typeof snapshot.location.floorKey === 'string' && typeof snapshot.location.buildingName === 'string'
      && typeof snapshot.location.floorName === 'string'
      && ['poiName', 'customLabel'].every(key => snapshot.location?.[key as 'poiName' | 'customLabel'] === undefined
        || typeof snapshot.location[key as 'poiName' | 'customLabel'] === 'string')));
  if (!value || value.notificationId !== id || !/^[0-9a-f]{24}$/.test(value.activityId)
    || typeof value.title !== 'string' || !validSnapshot(value.before) || !validSnapshot(value.after)) {
    throw new Error('No se pudo cargar el cambio de la actividad.');
  }
  return value;
}

/** Total de no leídas del usuario y alcance vigentes, sin depender de las páginas cargadas. */
export async function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const response = await authenticatedEnvelopeRequest<{ unreadCount: number }>('/api/v1/users/me/notifications/unread-count', { signal });
  const count = response.data?.unreadCount;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('No se pudo consultar el contador de notificaciones.');
  return count;
}

/** Lee una página cursorada y valida IDs, tipos y marcas de tiempo antes de exponerla. */
export async function fetchNotifications(cursor?: string, signal?: AbortSignal): Promise<NotificationPage> {
  const query = new URLSearchParams(); if (cursor) query.set('cursor', cursor);
  const response = await authenticatedEnvelopeRequest<NotificationPage>('/api/v1/users/me/notifications', { signal }, query);
  const value = response.data;
  const validTarget = (item: NotificationPage['items'][number]) => {
    if ('resourceType' in item) {
      if (!['FISICO','DIGITAL'].includes(item.resourceType) || !uuid.test(item.publicationId)) return false;
      if (item.type==='RESOURCE_REQUEST_RECEIVED'||item.type==='RESOURCE_UPDATED') return uuid.test(item.requestId);
      return ['RESOURCE_REQUEST_ACCEPTED','COORDINACION_RECURSO'].includes(item.type) && 'transactionId' in item && uuid.test(item.transactionId);
    }
    if (item.type==='PHYSICAL_PUBLICATION_CLOSE_REMINDER') return uuid.test(item.publicationId);
    return 'activityId' in item && /^[0-9a-f]{24}$/.test(item.activityId)
      && (item.seriesId===undefined||/^[0-9a-f]{24}$/.test(item.seriesId))
      && ['OFFICIAL_EVENT_PUBLISHED','ACTIVITY_CHANGED','OFFICIAL_EVENT_STARTED'].includes(item.type);
  };
  if (!value || !Array.isArray(value.items) || (value.nextCursor !== null && !uuid.test(value.nextCursor))
    || value.items.some(item => !item || !uuid.test(item.id) || !validTarget(item) || typeof item.title !== 'string'
      || typeof item.message !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
      || (item.readAt!==null&&!Number.isFinite(Date.parse(item.readAt))))) {
    throw new Error('No se pudieron cargar las notificaciones.');
  }
  return value;
}

/** Marca como leída o elimina la notificación y verifica el acuse de identidad. */
export async function updateNotification(id: string, remove: boolean, signal?: AbortSignal): Promise<void> {
  if (!uuid.test(id)) throw new Error('Notificación inválida.');
  const result = await authenticatedEnvelopeRequest<{ id: string }>(`/api/v1/users/me/notifications/${id}${remove ? '' : '/read'}`,
    { method: remove ? 'DELETE' : 'PUT', signal });
  if (result.data?.id !== id) throw new Error('No se pudo confirmar el cambio de la notificación.');
}
