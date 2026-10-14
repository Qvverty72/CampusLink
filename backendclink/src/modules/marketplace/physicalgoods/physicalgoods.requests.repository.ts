import type { PoolClient } from 'pg';
import type { PhysicalgoodsRequestRow } from './physicalgoods.types.js';

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
