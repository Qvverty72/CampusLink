import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import type { PendingActivityNotification } from '../activities/activities.notifications.repository.js';
import type { ActivityNotificationDto, NotificationPage } from './notifications.types.js';

const reasonLabels = { DATES_CHANGED: 'fechas', LOCATION_CHANGED: 'ubicación', CONTENT_CHANGED: 'información' };
const publicationMessage = 'Se publicó un evento oficial en tu campus.';

/** Conserva las notificaciones guardadas y presenta avisos antiguos de series como eventos concretos. */
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

/** El conflicto incluye filas retiradas lógicamente para que un reintento no las reactive. */
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

type SqlNotification = { id: string; actividad_id: string; publicacion_id:string;
  tipo_notificacion: ActivityNotificationDto['type']|'PHYSICAL_PUBLICATION_CLOSE_REMINDER';
  titulo: string; mensaje: string; created_at: Date; leida_en: Date | null; actividad_evento_clave: string };

// Las actividades conservan campus vigente; un aviso físico solo pertenece al propietario de su publicación original.
const ownNotificationScope=`n.destinatario_id=$1 AND (
  (n.campus_id=$2 AND n.actividad_evento_clave IS NOT NULL
    AND n.tipo_notificacion IN ('OFFICIAL_EVENT_PUBLISHED','ACTIVITY_CHANGED','OFFICIAL_EVENT_STARTED'))
  OR (n.tipo_notificacion='PHYSICAL_PUBLICATION_CLOSE_REMINDER' AND EXISTS(SELECT 1 FROM public.publicacion_recurso p
    WHERE p.id=n.publicacion_id AND p.tipo_recurso='FISICO' AND p.propietario_id=$1)))`;

/** Total de no leídas en el mismo alcance de la bandeja, independiente de la paginación. */
export async function countOwnUnreadNotifications(client: PoolClient, userId: string, campusId: string): Promise<number> {
  const result = await client.query<{ unread_count: string }>(`SELECT COUNT(*)::text AS unread_count
    FROM public.notificacion n WHERE ${ownNotificationScope} AND n.deleted_at IS NULL AND n.leida_en IS NULL`, [userId, campusId]);
  return Number(result.rows[0].unread_count);
}

export async function listOwnNotifications(client: PoolClient, userId: string, campusId: string, cursor?: string): Promise<NotificationPage> {
  const result = await client.query<SqlNotification>(`WITH own AS (
      SELECT n.* FROM public.notificacion n WHERE ${ownNotificationScope})
    SELECT id,actividad_id,publicacion_id,tipo_notificacion,titulo,mensaje,created_at,leida_en,actividad_evento_clave
    FROM own WHERE deleted_at IS NULL AND ($3::uuid IS NULL OR (created_at,id) <
      (SELECT created_at,id FROM own WHERE id=$3))
    ORDER BY created_at DESC,id DESC LIMIT 31`, [userId, campusId, cursor ?? null]);
  const items = result.rows.slice(0, 30).map(row => {
    if(row.tipo_notificacion==='PHYSICAL_PUBLICATION_CLOSE_REMINDER')return {
      id:row.id,publicationId:row.publicacion_id,type:row.tipo_notificacion,title:row.titulo,message:row.mensaje,
      createdAt:row.created_at.toISOString(),readAt:row.leida_en?.toISOString()??null,
    };
    const content = publicNotificationContent(row.tipo_notificacion, row.titulo, row.mensaje, row.actividad_evento_clave);
    return { id: row.id, activityId: row.actividad_id, type: row.tipo_notificacion, ...content,
      createdAt: row.created_at.toISOString(), readAt: row.leida_en?.toISOString() ?? null };
  });
  return { items, nextCursor: result.rows.length > 30 ? items.at(-1)!.id : null };
}

export async function updateOwnNotification(client: PoolClient, userId: string, campusId: string, id: string, remove: boolean): Promise<boolean> {
  const result = await client.query(`UPDATE public.notificacion n SET ${remove ? 'deleted_at=COALESCE(n.deleted_at,now())' : 'leida_en=COALESCE(n.leida_en,now())'}
    WHERE n.id=$3 AND ${ownNotificationScope}
      ${remove ? '' : 'AND n.deleted_at IS NULL'} RETURNING n.id`, [userId, campusId, id]);
  return result.rows.length === 1;
}

/** La clave interna se usa únicamente en servidor para encontrar la revisión del aviso propio. */
export async function findOwnActivityChange(client: PoolClient, userId: string, campusId: string, id: string) {
  const result = await client.query<{ actividad_id: string; actividad_evento_clave: string }>(`
    SELECT n.actividad_id,n.actividad_evento_clave FROM public.notificacion n
    WHERE n.id=$3 AND ${ownNotificationScope} AND n.deleted_at IS NULL
      AND n.tipo_notificacion='ACTIVITY_CHANGED'`, [userId, campusId, id]);
  return result.rows[0] ?? null;
}
