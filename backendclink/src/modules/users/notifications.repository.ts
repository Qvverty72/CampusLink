import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import type { PendingActivityNotification } from '../activities/activities.notifications.repository.js';
import type { ActivityNotificationDto, NotificationPage } from './notifications.types.js';

const reasonLabels = { DATES_CHANGED: 'fechas', LOCATION_CHANGED: 'ubicación', CONTENT_CHANGED: 'información' };
const publicationMessage = 'Se publicó un evento oficial en tu campus.';

/** Preserve stored notices while presenting old generated series text as a concrete event. */
function publicNotificationContent(type: ActivityNotificationDto['type'], title: string, message: string, key: string) {
  if (type === 'OFFICIAL_EVENT_PUBLISHED') {
    const legacyTitle = /^series:[0-9a-f]{24}:published$/.test(key) && /^Se publicó una serie de \d+ fechas de «/.test(message)
      ? /^Nuevo evento recurrente: ([\s\S]*) · \d+ fechas$/.exec(title)?.[1] : undefined;
    return { title: legacyTitle ?? title, message: publicationMessage };
  }
  if (type === 'OFFICIAL_EVENT_STARTED') return {
    title: /^Ya comenzó la ocurrencia \d+ de \d+ de «/.test(message)
      ? title.replace(/^Comenzó el evento oficial: /, '') : title,
    message: 'Ya comenzó el evento oficial en tu campus.',
  };
  return { title, message };
}

/** ON CONFLICT includes logically deleted rows, preventing their resurrection on retry. */
export async function deliverActivityNotification(task: PendingActivityNotification, participants: string[] | null,
  transaction = withPostgresTransaction): Promise<void> {
  const message = task.event.type === 'OFFICIAL_EVENT_PUBLISHED' ? publicationMessage
    : `Cambió la actividad en la que participas: ${task.event.reasons.map(reason => reasonLabels[reason]).join(', ')}.`;
  await transaction(async client => {
    if (task.event.deliveries) {
      const audience = new Set(participants ?? []);
      const rows = task.event.deliveries.filter(delivery => audience.has(delivery.recipientId)).map(delivery => {
        const reasons = delivery.reasons.map(reason => reasonLabels[reason]).join(', ');
        return { recipient_id: delivery.recipientId, activity_id: delivery.activityId,
          message: `Se ${delivery.dateCount === 1 ? 'modificó 1 fecha' : `modificaron ${delivery.dateCount} fechas`} de «${task.event.title}» en las que participas: ${reasons}.` };
      });
      await client.query(`INSERT INTO public.notificacion
        (destinatario_id,actividad_id,tipo_notificacion,titulo,mensaje,created_at,campus_id,actividad_evento_clave)
        SELECT p.id,n.activity_id,$2,$3,n.message,$4,$1,$5 FROM public.perfil_usuario p
        JOIN jsonb_to_recordset($6::jsonb) AS n(recipient_id uuid,activity_id text,message text) ON n.recipient_id=p.id
        WHERE p.campus_id=$1 AND p.estado_cuenta='ACTIVA' AND p.deleted_at IS NULL
        ON CONFLICT (destinatario_id,actividad_evento_clave) WHERE actividad_evento_clave IS NOT NULL DO NOTHING`,
      [task.campusId, task.event.type, task.event.title, task.event.occurredAt, task.event.key, JSON.stringify(rows)]);
      return;
    }
    const content = publicNotificationContent(task.event.type, task.event.title, task.event.message ?? message, task.event.key);
    await client.query(`INSERT INTO public.notificacion
      (destinatario_id,actividad_id,tipo_notificacion,titulo,mensaje,created_at,campus_id,actividad_evento_clave)
      SELECT p.id,$2,$3,$4,$5,$6,$1,$7 FROM public.perfil_usuario p
      WHERE p.campus_id=$1 AND p.estado_cuenta='ACTIVA' AND p.deleted_at IS NULL
        AND ($8::uuid[] IS NULL OR p.id=ANY($8::uuid[]))
      ON CONFLICT (destinatario_id,actividad_evento_clave) WHERE actividad_evento_clave IS NOT NULL DO NOTHING`,
    [task.campusId, task.activityId, task.event.type, content.title, content.message, task.event.occurredAt, task.event.key, participants]);
  });
}

type SqlNotification = { id: string; actividad_id: string; tipo_notificacion: ActivityNotificationDto['type'];
  titulo: string; mensaje: string; created_at: Date; leida_en: Date | null; actividad_evento_clave: string };

export async function listOwnNotifications(client: PoolClient, userId: string, campusId: string, cursor?: string): Promise<NotificationPage> {
  const result = await client.query<SqlNotification>(`SELECT id,actividad_id,tipo_notificacion,titulo,mensaje,created_at,leida_en,actividad_evento_clave
    FROM public.notificacion WHERE destinatario_id=$1 AND campus_id=$2 AND deleted_at IS NULL
      AND actividad_evento_clave IS NOT NULL AND ($3::uuid IS NULL OR (created_at,id) <
        (SELECT created_at,id FROM public.notificacion WHERE id=$3 AND destinatario_id=$1 AND campus_id=$2))
    ORDER BY created_at DESC,id DESC LIMIT 31`, [userId, campusId, cursor ?? null]);
  const items = result.rows.slice(0, 30).map(row => {
    const content = publicNotificationContent(row.tipo_notificacion, row.titulo, row.mensaje, row.actividad_evento_clave);
    return { id: row.id, activityId: row.actividad_id, type: row.tipo_notificacion, ...content,
      createdAt: row.created_at.toISOString(), readAt: row.leida_en?.toISOString() ?? null };
  });
  return { items, nextCursor: result.rows.length > 30 ? items.at(-1)!.id : null };
}

export async function updateOwnNotification(client: PoolClient, userId: string, campusId: string, id: string, remove: boolean): Promise<boolean> {
  const result = await client.query(`UPDATE public.notificacion SET ${remove ? 'deleted_at=COALESCE(deleted_at,now())' : 'leida_en=COALESCE(leida_en,now())'}
    WHERE id=$1 AND destinatario_id=$2 AND campus_id=$3 AND actividad_evento_clave IS NOT NULL
      ${remove ? '' : 'AND deleted_at IS NULL'} RETURNING id`, [id, userId, campusId]);
  return result.rows.length === 1;
}
