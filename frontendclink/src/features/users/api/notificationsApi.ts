import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';

import type { NotificationPage } from '../types/notification';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!value || !Array.isArray(value.items) || (value.nextCursor !== null && !uuid.test(value.nextCursor))
    || value.items.some(item => !uuid.test(item.id)
      || (item.type==='PHYSICAL_PUBLICATION_CLOSE_REMINDER'?!uuid.test(item.publicationId):
        (!/^[0-9a-f]{24}$/.test(item.activityId)||(item.seriesId!==undefined&&!/^[0-9a-f]{24}$/.test(item.seriesId))
          ||!['OFFICIAL_EVENT_PUBLISHED','ACTIVITY_CHANGED','OFFICIAL_EVENT_STARTED'].includes(item.type))) || typeof item.title !== 'string'
      || typeof item.message !== 'string' || !Number.isFinite(Date.parse(item.createdAt)))) {
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
