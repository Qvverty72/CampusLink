import type { UserNotification } from '../types/notification';

export const NOTIFICATION_LABELS: Record<UserNotification['type'], string> = {
  OFFICIAL_EVENT_PUBLISHED: 'Evento oficial publicado',
  OFFICIAL_EVENT_STARTED: 'Evento oficial en curso',
  ACTIVITY_CHANGED: 'Actividad actualizada',
  PHYSICAL_PUBLICATION_CLOSE_REMINDER: 'Revisar publicación',
};

/** Agrupa las páginas cargadas según la semana local, de lunes a domingo. */
export function groupNotifications(items: UserNotification[], now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const recent: UserNotification[] = [], older: UserNotification[] = [];
  for (const item of items) {
    const time = new Date(item.createdAt).getTime();
    (time >= start.getTime() && time < end.getTime() ? recent : older).push(item);
  }
  return [{ title: 'Esta semana', items: recent }, { title: 'Anteriores', items: older }].filter(group => group.items.length);
}

export function formatNotificationDate(createdAt: string, now = new Date()) {
  const date = new Date(createdAt);
  return date.toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } as const : {}),
  });
}
