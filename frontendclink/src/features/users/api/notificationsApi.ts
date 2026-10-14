import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';

import type { NotificationPage } from '../types/notification';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lee una página cursorada y valida IDs, tipos y marcas de tiempo antes de exponerla. */
export async function fetchNotifications(cursor?: string, signal?: AbortSignal): Promise<NotificationPage> {
  const query = new URLSearchParams(); if (cursor) query.set('cursor', cursor);
  const response = await authenticatedEnvelopeRequest<NotificationPage>('/api/v1/users/me/notifications', { signal }, query);
  const value = response.data;
  if (!value || !Array.isArray(value.items) || (value.nextCursor !== null && !uuid.test(value.nextCursor))
    || value.items.some(item => !uuid.test(item.id) || !/^[0-9a-f]{24}$/.test(item.activityId)
      || (item.seriesId !== undefined && !/^[0-9a-f]{24}$/.test(item.seriesId))
      || !['OFFICIAL_EVENT_PUBLISHED', 'ACTIVITY_CHANGED', 'OFFICIAL_EVENT_STARTED'].includes(item.type) || typeof item.title !== 'string'
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
