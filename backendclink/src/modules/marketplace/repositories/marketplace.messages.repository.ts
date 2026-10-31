import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../../shared/http/api.types.js';

export interface ResourceMessageRow {
  id: string; publicacion_id: string; transaccion_id: string; destinatario_id: string; mensaje: string; created_at: string;
}
const projection = `id,publicacion_id,transaccion_id,destinatario_id,mensaje,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

/** Retirar un aviso de la bandeja no borra el historial de la transacción. */
export async function resourceCoordinationMessages(client: PoolClient, publicationId: string, transactionId: string, participants: string[], page: PaginationParams) {
  return (await client.query<ResourceMessageRow>(`SELECT ${projection} FROM public.notificacion
    WHERE transaccion_id=$1 AND publicacion_id=$2 AND tipo_notificacion='COORDINACION_RECURSO'
    AND destinatario_id=ANY($3::uuid[]) ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5`,
  [transactionId, publicationId, participants, page.limit + 1, page.offset])).rows;
}
export async function findResourceMessage(client: PoolClient, id: string) {
  return (await client.query<ResourceMessageRow>(`SELECT ${projection} FROM public.notificacion WHERE id=$1 AND tipo_notificacion='COORDINACION_RECURSO'`, [id])).rows[0] ?? null;
}
export async function insertResourceCoordination(client: PoolClient, publicationId: string, transactionId: string, recipientId: string, message: string, messageId?: string) {
  return (await client.query<ResourceMessageRow>(`INSERT INTO public.notificacion
    (publicacion_id,transaccion_id,destinatario_id,tipo_notificacion,titulo,mensaje,created_at,id)
    VALUES($1,$2,$3,'COORDINACION_RECURSO','Coordinación del intercambio',$4,clock_timestamp(),COALESCE($5::uuid,gen_random_uuid()))
    RETURNING ${projection}`, [publicationId, transactionId, recipientId, message, messageId ?? null])).rows[0];
}
