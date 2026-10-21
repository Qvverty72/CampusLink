import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../../types/api.js';
import type { DigitalRequestRow, DigitalTradeRow } from './elibrary.types.js';

export async function digitalTradeParticipants(client: PoolClient, id: string, institutionId: string, requestId: string | null, tradeId: string | null) {
  return (await client.query<{ ownerId:string; receiverId:string|null }>(`SELECT p.propietario_id AS "ownerId",COALESCE(t.receptor_id,r.solicitante_id) AS "receiverId"
    FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
    LEFT JOIN public.solicitud_recurso r ON r.publicacion_id=p.id AND r.id=$3
    LEFT JOIN public.transaccion_recurso t ON t.publicacion_id=p.id AND t.id=$4
    WHERE p.id=$1 AND c.institucion_id=$2 AND p.tipo_recurso='DIGITAL'`,[id,institutionId,requestId,tradeId])).rows[0] ?? null;
}
export async function lockDigitalProfiles(client: PoolClient, ids: string[]) {
  await client.query('SELECT id FROM public.perfil_usuario WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',[ids]);
}
export async function digitalMembersEnabled(client: PoolClient, ids: string[], institutionId: string) {
  const rows = (await client.query<{id:string}>(`SELECT p.id FROM public.perfil_usuario p JOIN public.campus c ON c.id=p.campus_id AND c.institucion_id=p.institucion_id
    WHERE p.id=ANY($1::uuid[]) AND p.institucion_id=$2 AND c.activo AND p.estado_cuenta='ACTIVA' AND p.deleted_at IS NULL
    AND (p.verificado_en IS NOT NULL OR EXISTS(SELECT 1 FROM public.usuario_rol ur JOIN public.rol r ON r.id=ur.rol_id
      WHERE ur.perfil_usuario_id=p.id AND ur.campus_id=p.campus_id AND ur.revocado_en IS NULL AND r.nombre IN ('ADMINISTRADOR','USUARIO_AUTORIZADO')))`,[ids,institutionId])).rows;
  return rows.length === new Set(ids).size;
}
export async function digitalRequestMessages(client: PoolClient) {
  return (await client.query<{code:string;description:string}>('SELECT codigo AS code,descripcion AS description FROM public.mensaje_solicitud WHERE activo ORDER BY codigo FOR SHARE')).rows;
}
export async function activeDigitalRequest(client: PoolClient, id: string, requester: string) {
  return (await client.query<{id:string}>('SELECT id FROM public.solicitud_recurso WHERE publicacion_id=$1 AND solicitante_id=$2 AND estado_solicitud IN (\'PENDIENTE\',\'ACEPTADA\')',[id,requester])).rows[0] ?? null;
}
const requestProjection = `r.id,r.publicacion_id,r.solicitante_id,r.estado_solicitud,r.codigo_mensaje,r.solicitada_en,p.titulo AS title,
 p.propietario_id AS "ownerId",u.nombre_completo AS "requesterName",m.descripcion AS message,t.id AS "transactionId",t.estado_transaccion AS "transactionStatus"`;
const requestJoins = `FROM public.solicitud_recurso r JOIN public.publicacion_recurso p ON p.id=r.publicacion_id JOIN public.recurso_digital d ON d.publicacion_id=p.id
 JOIN public.perfil_usuario u ON u.id=r.solicitante_id JOIN public.mensaje_solicitud m ON m.codigo=r.codigo_mensaje
 LEFT JOIN public.transaccion_recurso t ON t.solicitud_id=r.id`;
export async function findDigitalRequest(client: PoolClient, id: string, requestId: string) {
  return (await client.query<DigitalRequestRow>(`SELECT ${requestProjection} ${requestJoins} WHERE r.publicacion_id=$1 AND r.id=$2 FOR UPDATE OF r`,[id,requestId])).rows[0] ?? null;
}
export async function insertDigitalRequest(client: PoolClient, id: string, userId: string, code: string) {
  return (await client.query<{id:string}>(`INSERT INTO public.solicitud_recurso(publicacion_id,solicitante_id,codigo_mensaje) VALUES($1,$2,$3) RETURNING id`,[id,userId,code])).rows[0].id;
}
export async function setDigitalRequestStatus(client: PoolClient, id: string, status: string) {
  await client.query('UPDATE public.solicitud_recurso SET estado_solicitud=$2,updated_at=clock_timestamp() WHERE id=$1',[id,status]);
}
export async function listDigitalRequests(client: PoolClient, institutionId: string, userId: string, received: boolean, page: PaginationParams) {
  return (await client.query<DigitalRequestRow>(`SELECT ${requestProjection} ${requestJoins} JOIN public.campus c ON c.id=p.campus_id
    WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL' AND (($3 AND p.propietario_id=$2) OR (NOT $3 AND r.solicitante_id=$2))
    ORDER BY r.solicitada_en DESC,r.id DESC LIMIT $4 OFFSET $5`,[institutionId,userId,received,page.limit+1,page.offset])).rows;
}
export async function insertDigitalTrade(client: PoolClient, id: string, requestId: string, receiverId: string) {
  return (await client.query<{id:string}>(`INSERT INTO public.transaccion_recurso(solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada,monto_acordado,moneda)
    SELECT $2,p.id,p.propietario_id,$3,p.modalidad,p.precio,p.moneda FROM public.publicacion_recurso p WHERE p.id=$1 RETURNING id`,[id,requestId,receiverId])).rows[0].id;
}
export async function findDigitalTrade(client: PoolClient, id: string, tradeId: string) {
  return (await client.query<DigitalTradeRow>('SELECT * FROM public.transaccion_recurso WHERE publicacion_id=$1 AND id=$2 FOR UPDATE',[id,tradeId])).rows[0] ?? null;
}
export async function digitalConfirmations(client: PoolClient, tradeId: string) {
  return (await client.query<{userId:string;role:string;confirmedAt:string|Date}>(`SELECT usuario_id AS "userId",rol_confirmante AS role,confirmado_en AS "confirmedAt"
    FROM public.confirmacion_transaccion WHERE transaccion_id=$1 ORDER BY confirmado_en,id`,[tradeId])).rows;
}
export async function confirmDigitalParticipant(client: PoolClient, tradeId: string, userId: string, role: string) {
  await client.query('INSERT INTO public.confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[tradeId,userId,role]);
}
export async function setDigitalTradeStatus(client: PoolClient, row: DigitalTradeRow, status: string, actor: string) {
  await client.query(`UPDATE public.transaccion_recurso SET estado_transaccion=$2,completada_en=CASE WHEN $2='COMPLETADA' THEN clock_timestamp() ELSE NULL END,
    cancelada_en=CASE WHEN $2='CANCELADA' THEN clock_timestamp() ELSE NULL END,cancelada_por_id=CASE WHEN $2='CANCELADA' THEN $3::uuid ELSE NULL END,
    motivo_cancelacion=CASE WHEN $2='CANCELADA' THEN 'USUARIO_DESISTE' ELSE NULL END WHERE id=$1`,[row.id,status,actor]);
  if (status==='CANCELADA') await setDigitalRequestStatus(client,row.solicitud_id,'CANCELADA');
  if (status==='COMPLETADA') await client.query(`INSERT INTO public.acceso_recurso_digital(transaccion_id,publicacion_id,receptor_id)
    VALUES($1,$2,$3)`,[row.id,row.publicacion_id,row.receptor_id]);
}
