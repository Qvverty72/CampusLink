import type { PoolClient } from 'pg';

type ResourceEvent = 'RESOURCE_REQUEST_RECEIVED' | 'RESOURCE_UPDATED' | 'RESOURCE_REQUEST_ACCEPTED';
const messages: Record<ResourceEvent, string> = {
  RESOURCE_REQUEST_RECEIVED: 'Recibiste una nueva solicitud para tu recurso.',
  RESOURCE_UPDATED: 'Cambió el precio o contenido de un recurso que solicitaste. Revisa su información actual. Los términos de las transacciones existentes se conservan.',
  RESOURCE_REQUEST_ACCEPTED: 'Tu solicitud fue aceptada. Ya puedes consultar la transacción del recurso.',
};

/** Se ejecuta bajo el lock de publicación y en la transacción del evento original. */
async function deliverResourceEvent(client: PoolClient, publicationId: string, type: ResourceEvent,
  requestId: string | null = null, transactionId: string | null = null) {
  await client.query(`INSERT INTO public.notificacion
    (destinatario_id,publicacion_id,transaccion_id,tipo_notificacion,titulo,mensaje,created_at,campus_id,actividad_evento_clave)
    SELECT DISTINCT u.id,p.id,t.id,$2,p.titulo,$5,statement_timestamp(),p.campus_id,
      CASE WHEN $2='RESOURCE_UPDATED' THEN 'resource:'||p.id||':updated:'||
        to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ELSE 'resource:request:'||s.id||CASE WHEN $2='RESOURCE_REQUEST_RECEIVED' THEN ':received' ELSE ':accepted' END END
    FROM public.publicacion_recurso p JOIN public.campus c ON c.id=p.campus_id
    JOIN public.solicitud_recurso s ON s.publicacion_id=p.id
    LEFT JOIN public.transaccion_recurso t ON t.publicacion_id=p.id AND t.solicitud_id=s.id AND t.id=$4::uuid
    JOIN public.perfil_usuario u ON u.id=CASE WHEN $2='RESOURCE_REQUEST_RECEIVED' THEN p.propietario_id ELSE s.solicitante_id END
    WHERE p.id=$1 AND ($2='RESOURCE_UPDATED' OR s.id=$3::uuid)
      AND ($2<>'RESOURCE_REQUEST_ACCEPTED' OR (t.id IS NOT NULL AND t.receptor_id=s.solicitante_id AND t.propietario_id=p.propietario_id))
      AND u.estado_cuenta='ACTIVA' AND u.deleted_at IS NULL AND u.institucion_id=c.institucion_id
      AND (p.tipo_recurso='DIGITAL' OR (p.tipo_recurso='FISICO' AND u.campus_id=p.campus_id))
      AND ($2='RESOURCE_REQUEST_RECEIVED' OR u.id<>p.propietario_id)
    ON CONFLICT (destinatario_id,actividad_evento_clave) WHERE actividad_evento_clave IS NOT NULL DO NOTHING`,
  [publicationId, type, requestId, transactionId, messages[type]]);
}

export function notifyResourceRequest(client: PoolClient, publicationId: string, requestId: string, transactionId?: string) {
  return deliverResourceEvent(client, publicationId, transactionId ? 'RESOURCE_REQUEST_ACCEPTED' : 'RESOURCE_REQUEST_RECEIVED', requestId, transactionId ?? null);
}

/** Una entrega por solicitante y versión, también si existen varias solicitudes históricas. */
export function notifyResourceUpdated(client: PoolClient, publicationId: string) {
  return deliverResourceEvent(client, publicationId, 'RESOURCE_UPDATED');
}
