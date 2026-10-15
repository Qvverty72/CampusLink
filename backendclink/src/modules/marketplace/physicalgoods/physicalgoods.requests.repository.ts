import type { PoolClient } from 'pg';
import type { PhysicalgoodsReceivedRow, PhysicalgoodsRequestRow } from './physicalgoods.types.js';
import type { PaginationParams } from '../../../types/api.js';

const projection = `id,publicacion_id,solicitante_id,codigo_mensaje,estado_solicitud,
  to_char(solicitada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS solicitada_en`;

export async function findActivePhysicalgoodsRequest(client: PoolClient, publicationId: string, userId: string) {
  return (await client.query<PhysicalgoodsRequestRow>(`SELECT ${projection} FROM public.solicitud_recurso
    WHERE publicacion_id=$1 AND solicitante_id=$2 AND estado_solicitud IN ('PENDIENTE','ACEPTADA')
    ORDER BY solicitada_en,id LIMIT 1`, [publicationId,userId])).rows[0] ?? null;
}
export async function physicalgoodsRequestMessages(client: PoolClient) {
  return (await client.query<{ code:string; label:string }>('SELECT codigo AS code,descripcion AS label FROM public.mensaje_solicitud WHERE activo=true ORDER BY codigo')).rows;
}
export async function findPhysicalgoodsRequestMessage(client: PoolClient, code: string) {
  return (await client.query<{ activo:boolean }>('SELECT activo FROM public.mensaje_solicitud WHERE codigo=$1 FOR SHARE',[code])).rows[0] ?? null;
}
export async function insertPhysicalgoodsRequest(client: PoolClient, publicationId: string, userId: string, code: string) {
  return (await client.query<PhysicalgoodsRequestRow>(`INSERT INTO public.solicitud_recurso(publicacion_id,solicitante_id,codigo_mensaje)
    VALUES($1,$2,$3) RETURNING ${projection}`, [publicationId,userId,code])).rows[0];
}
export async function findPhysicalgoodsRequest(client: PoolClient, publicationId: string, requestId: string) {
  return (await client.query<PhysicalgoodsRequestRow>(`SELECT ${projection} FROM public.solicitud_recurso
    WHERE publicacion_id=$1 AND id=$2 FOR UPDATE`,[publicationId,requestId])).rows[0] ?? null;
}
export async function updatePhysicalgoodsRequestStatus(client: PoolClient, requestId: string, status: PhysicalgoodsRequestRow['estado_solicitud']) {
  await client.query(`UPDATE public.solicitud_recurso SET estado_solicitud=$2,updated_at=clock_timestamp() WHERE id=$1`,[requestId,status]);
}
export async function closePendingPhysicalgoodsRequests(client: PoolClient, publicationId: string) {
  await client.query(`UPDATE public.solicitud_recurso SET estado_solicitud='CANCELADA',updated_at=clock_timestamp()
    WHERE publicacion_id=$1 AND estado_solicitud='PENDIENTE'`,[publicationId]);
}
const ownRequestProjection = `SELECT s.id,s.publicacion_id,s.solicitante_id,s.codigo_mensaje,s.estado_solicitud,
    to_char(s.solicitada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS solicitada_en,
    p.titulo,p.estado_publicacion,p.deleted_at,p.modalidad,p.precio,p.campus_id,c.nombre AS campus_nombre,
    p.propietario_id,o.nombre_completo AS propietario_nombre,u.nombre_completo AS solicitante_nombre,m.descripcion AS mensaje,
    t.id AS transaccion_id,t.estado_transaccion
    FROM public.solicitud_recurso s JOIN public.publicacion_recurso p ON p.id=s.publicacion_id
    JOIN public.recurso_fisico r ON r.publicacion_id=p.id JOIN public.perfil_usuario u ON u.id=s.solicitante_id
    JOIN public.campus c ON c.id=p.campus_id JOIN public.perfil_usuario o ON o.id=p.propietario_id
    JOIN public.mensaje_solicitud m ON m.codigo=s.codigo_mensaje LEFT JOIN public.transaccion_recurso t ON t.solicitud_id=s.id
      AND t.publicacion_id=p.id AND (t.propietario_id=$1 OR t.receptor_id=$1)`;
export async function listPhysicalgoodsRequests(client: PoolClient, userId: string, pagination: PaginationParams, received: boolean) {
  return (await client.query<PhysicalgoodsReceivedRow>(`${ownRequestProjection}
    WHERE ${received ? 'p.propietario_id' : 's.solicitante_id'}=$1 AND p.tipo_recurso='FISICO'
    ORDER BY p.publicado_en DESC,p.id,s.solicitada_en,s.id LIMIT $2 OFFSET $3`,
    [userId,pagination.limit+1,pagination.offset])).rows;
}
export async function findOwnPhysicalgoodsRequest(client:PoolClient,userId:string,publicationId:string,requestId:string) {
  return (await client.query<PhysicalgoodsReceivedRow>(`${ownRequestProjection}
    WHERE (p.propietario_id=$1 OR s.solicitante_id=$1) AND p.tipo_recurso='FISICO' AND p.id=$2 AND s.id=$3`,
    [userId,publicationId,requestId])).rows[0]??null;
}
