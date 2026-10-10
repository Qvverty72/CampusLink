import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import type { PendingActivityNotification } from '../activities/activities.notifications.repository.js';
import type { ActivityNotificationDto, NotificationPage } from './notifications.types.js';

const reasonLabels = { DATES_CHANGED: 'fechas', LOCATION_CHANGED: 'ubicación', CONTENT_CHANGED: 'información' };

/** ON CONFLICT includes logically deleted rows, preventing their resurrection on retry. */
export async function deliverActivityNotification(task: PendingActivityNotification, participants: string[] | null,
  transaction = withPostgresTransaction): Promise<void> {
  const message = task.event.type === 'OFFICIAL_EVENT_PUBLISHED' ? 'Se publicó un evento oficial en tu campus.'
    : `Cambió la actividad en la que participas: ${task.event.reasons.map(reason => reasonLabels[reason]).join(', ')}.`;
  await transaction(async client => {
    await client.query(`INSERT INTO public.notificacion
      (destinatario_id,actividad_id,tipo_notificacion,titulo,mensaje,created_at,campus_id,actividad_evento_clave)
      SELECT p.id,$2,$3,$4,$5,$6,$1,$7 FROM public.perfil_usuario p
      WHERE p.campus_id=$1 AND p.estado_cuenta='ACTIVA' AND p.deleted_at IS NULL
        AND ($8::uuid[] IS NULL OR p.id=ANY($8::uuid[]))
      ON CONFLICT (destinatario_id,actividad_evento_clave) WHERE actividad_evento_clave IS NOT NULL DO NOTHING`,
    [task.campusId, task.activityId, task.event.type, task.event.title, message, task.event.occurredAt, task.event.key, participants]);
  });
}

type SqlNotification = { id: string; actividad_id: string; tipo_notificacion: ActivityNotificationDto['type'];
  titulo: string; mensaje: string; created_at: Date; leida_en: Date | null };

export async function listOwnNotifications(client: PoolClient, userId: string, campusId: string, cursor?: string): Promise<NotificationPage> {
  const result = await client.query<SqlNotification>(`SELECT id,actividad_id,tipo_notificacion,titulo,mensaje,created_at,leida_en
    FROM public.notificacion WHERE destinatario_id=$1 AND campus_id=$2 AND deleted_at IS NULL
      AND actividad_evento_clave IS NOT NULL AND ($3::uuid IS NULL OR (created_at,id) <
        (SELECT created_at,id FROM public.notificacion WHERE id=$3 AND destinatario_id=$1 AND campus_id=$2))
    ORDER BY created_at DESC,id DESC LIMIT 31`, [userId, campusId, cursor ?? null]);
  const items = result.rows.slice(0, 30).map(row => ({ id: row.id, activityId: row.actividad_id,
    type: row.tipo_notificacion, title: row.titulo, message: row.mensaje, createdAt: row.created_at.toISOString(), readAt: row.leida_en?.toISOString() ?? null }));
  return { items, nextCursor: result.rows.length > 30 ? items.at(-1)!.id : null };
}

export async function updateOwnNotification(client: PoolClient, userId: string, campusId: string, id: string, remove: boolean): Promise<boolean> {
  const result = await client.query(`UPDATE public.notificacion SET ${remove ? 'deleted_at=COALESCE(deleted_at,now())' : 'leida_en=COALESCE(leida_en,now())'}
    WHERE id=$1 AND destinatario_id=$2 AND campus_id=$3 AND actividad_evento_clave IS NOT NULL
      ${remove ? '' : 'AND deleted_at IS NULL'} RETURNING id`, [id, userId, campusId]);
  return result.rows.length === 1;
}
