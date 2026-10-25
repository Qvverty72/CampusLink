import type { PoolClient } from 'pg';
import type { PhysicalgoodsReceivedRow, PhysicalgoodsRequestRow } from './physicalgoods.types.js';
import type { PaginationParams } from '../../../types/api.js';

const projection = `id,publicacion_id,solicitante_id,codigo_mensaje,estado_solicitud,
  to_char(solicitada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS solicitada_en`;

/** Totales propios sin paginar ni cargar mensajes, carreras o fotografías. */
export async function countPhysicalgoodsRequests(client:PoolClient,userId:string){
  return (await client.query<{sentAccepted:number;receivedPending:number;pendingRequests:number}>(`SELECT
    (SELECT count(*)::integer FROM public.solicitud_recurso s
      JOIN public.publicacion_recurso p ON p.id=s.publicacion_id JOIN public.recurso_fisico r ON r.publicacion_id=p.id
      WHERE s.solicitante_id=$1 AND p.tipo_recurso='FISICO' AND s.estado_solicitud='ACEPTADA'
        AND EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.solicitud_id=s.id AND t.publicacion_id=p.id
          AND t.receptor_id=$1 AND t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION'))) AS "sentAccepted",
    (SELECT count(*)::integer FROM public.solicitud_recurso s
      JOIN public.publicacion_recurso p ON p.id=s.publicacion_id JOIN public.recurso_fisico r ON r.publicacion_id=p.id
      WHERE p.propietario_id=$1 AND p.tipo_recurso='FISICO' AND (
        (s.estado_solicitud='PENDIENTE' AND NOT EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.solicitud_id=s.id AND t.publicacion_id=p.id))
        OR (s.estado_solicitud='ACEPTADA' AND EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.solicitud_id=s.id AND t.publicacion_id=p.id
          AND t.propietario_id=$1 AND t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION'))))) AS "receivedPending",
    (SELECT count(*)::integer FROM public.solicitud_recurso s
      JOIN public.publicacion_recurso p ON p.id=s.publicacion_id JOIN public.recurso_fisico r ON r.publicacion_id=p.id
      WHERE p.propietario_id=$1 AND p.tipo_recurso='FISICO' AND s.estado_solicitud='PENDIENTE'
        AND NOT EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.solicitud_id=s.id AND t.publicacion_id=p.id)) AS "pendingRequests"`,[userId])).rows[0];
}

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
export async function insertPhysicalgoodsRequest(client: PoolClient, publicationId: string, userId: string, code: string, operationId?: string) {
  return (await client.query<PhysicalgoodsRequestRow>(`INSERT INTO public.solicitud_recurso(publicacion_id,solicitante_id,codigo_mensaje,id,solicitada_en)
    VALUES($1,$2,$3,COALESCE($4::uuid,gen_random_uuid()),clock_timestamp()) RETURNING ${projection}`, [publicationId,userId,code,operationId??null])).rows[0];
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
    to_char(p.publicado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS publicado_en,
    p.titulo,p.estado_publicacion,p.deleted_at,p.modalidad,p.precio,p.campus_id,c.nombre AS campus_nombre,
    p.propietario_id,o.nombre_completo AS propietario_nombre,u.nombre_completo AS solicitante_nombre,m.descripcion AS mensaje,
    ARRAY(SELECT ca.nombre FROM public.usuario_carrera uc JOIN public.carrera ca ON ca.id=uc.carrera_id
      WHERE uc.perfil_usuario_id=u.id AND ca.institucion_id=u.institucion_id ORDER BY ca.nombre,ca.id) AS solicitante_carreras,
    t.id AS transaccion_id,t.estado_transaccion,t.modalidad_acordada,t.monto_acordado,t.moneda AS moneda_acordada
    FROM public.solicitud_recurso s JOIN public.publicacion_recurso p ON p.id=s.publicacion_id
    JOIN public.recurso_fisico r ON r.publicacion_id=p.id JOIN public.perfil_usuario u ON u.id=s.solicitante_id
    JOIN public.campus c ON c.id=p.campus_id JOIN public.perfil_usuario o ON o.id=p.propietario_id
    JOIN public.mensaje_solicitud m ON m.codigo=s.codigo_mensaje LEFT JOIN public.transaccion_recurso t ON t.solicitud_id=s.id
      AND t.publicacion_id=p.id AND (t.propietario_id=$1 OR t.receptor_id=$1)`;
export async function listPhysicalgoodsRequests(client: PoolClient, userId: string, pagination: PaginationParams, received: boolean) {
  const order=received?'p.publicado_en DESC,p.id,s.solicitada_en,s.id'
    :"CASE WHEN t.estado_transaccion='COMPLETADA' OR s.estado_solicitud='RECHAZADA' THEN 1 ELSE 0 END,s.solicitada_en DESC,s.id";
  return (await client.query<PhysicalgoodsReceivedRow>(`${ownRequestProjection}
    WHERE ${received ? 'p.propietario_id' : 's.solicitante_id'}=$1 AND p.tipo_recurso='FISICO'
    ORDER BY ${order} LIMIT $2 OFFSET $3`,
    [userId,pagination.limit+1,pagination.offset])).rows;
}
export async function findOwnPhysicalgoodsRequest(client:PoolClient,userId:string,publicationId:string,requestId:string) {
  return (await client.query<PhysicalgoodsReceivedRow>(`${ownRequestProjection}
    WHERE (p.propietario_id=$1 OR s.solicitante_id=$1) AND p.tipo_recurso='FISICO' AND p.id=$2 AND s.id=$3`,
    [userId,publicationId,requestId])).rows[0]??null;
}

/** Pagina recursos, nunca corta las solicitudes de un mismo recurso. Incluye historia propia. */
export async function listReceivedRequestPublications(client:PoolClient,userId:string,pagination:PaginationParams){
  return (await client.query<{id:string}>(`SELECT p.id FROM public.publicacion_recurso p
    JOIN public.recurso_fisico r ON r.publicacion_id=p.id
    WHERE p.propietario_id=$1 AND p.tipo_recurso='FISICO'
      AND EXISTS(SELECT 1 FROM public.solicitud_recurso s WHERE s.publicacion_id=p.id)
    ORDER BY CASE
      WHEN EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.publicacion_id=p.id AND t.propietario_id=$1
        AND t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION')) THEN 0
      WHEN EXISTS(SELECT 1 FROM public.solicitud_recurso s WHERE s.publicacion_id=p.id AND s.estado_solicitud='PENDIENTE'
        AND NOT EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.solicitud_id=s.id AND t.publicacion_id=p.id)) THEN 1
      WHEN EXISTS(SELECT 1 FROM public.transaccion_recurso t WHERE t.publicacion_id=p.id AND t.propietario_id=$1
        AND t.estado_transaccion='COMPLETADA') THEN 3
      ELSE 2 END,p.publicado_en DESC,p.id LIMIT $2 OFFSET $3`,[userId,pagination.limit+1,pagination.offset])).rows;
}
export async function listReceivedRequestsForPublications(client:PoolClient,userId:string,publicationIds:string[]){
  if(!publicationIds.length)return [];
  return (await client.query<PhysicalgoodsReceivedRow>(`${ownRequestProjection}
    WHERE p.propietario_id=$1 AND p.tipo_recurso='FISICO' AND p.id=ANY($2::uuid[])
    ORDER BY array_position($2::uuid[],p.id),s.solicitada_en,s.id`,[userId,publicationIds])).rows;
}
