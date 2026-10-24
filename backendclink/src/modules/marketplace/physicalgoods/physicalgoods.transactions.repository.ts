import type { PoolClient } from 'pg';
import type { PhysicalgoodsConfirmationRow,PhysicalgoodsCoordinationRow,PhysicalgoodsRatingRow,PhysicalgoodsTransactionDetailRow,PhysicalgoodsTransactionRow } from './physicalgoods.types.js';
import type { PaginationParams } from '../../../types/api.js';

const confirmationProjection = `usuario_id,rol_confirmante,
  to_char(confirmado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS confirmado_en`;
const messageProjection = `id,destinatario_id,mensaje,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;
const ratingProjection=`id,transaccion_id,evaluador_id,evaluado_id,puntuacion,
  to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at`;

export async function findPhysicalgoodsRating(client:PoolClient,transactionId:string) {
  return (await client.query<PhysicalgoodsRatingRow>(`SELECT ${ratingProjection} FROM public.valoracion WHERE transaccion_id=$1`,[transactionId])).rows[0]??null;
}
export async function insertPhysicalgoodsRating(client:PoolClient,transactionId:string,reviewerId:string,ownerId:string,score:number) {
  return (await client.query<PhysicalgoodsRatingRow>(`INSERT INTO public.valoracion(transaccion_id,evaluador_id,evaluado_id,puntuacion)
    VALUES($1,$2,$3,$4) RETURNING ${ratingProjection}`,[transactionId,reviewerId,ownerId,score])).rows[0];
}

export async function hasActivePhysicalgoodsTransaction(client: PoolClient, publicationId: string) {
  return (await client.query(`SELECT id FROM public.transaccion_recurso WHERE publicacion_id=$1
    AND estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION') LIMIT 1`,[publicationId])).rows.length > 0;
}
export async function findActivePhysicalgoodsTransaction(client:PoolClient,publicationId:string,ownerId:string) {
  return (await client.query<{id:string;status:PhysicalgoodsTransactionRow['estado_transaccion']}>(`SELECT id,estado_transaccion AS status
    FROM public.transaccion_recurso WHERE publicacion_id=$1 AND propietario_id=$2
    AND estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION') ORDER BY iniciada_en DESC,id DESC LIMIT 1`,[publicationId,ownerId])).rows[0]??null;
}
export async function insertPhysicalgoodsTransaction(client: PoolClient, publicationId: string, requestId: string, requesterId: string) {
  return (await client.query<PhysicalgoodsTransactionRow>(`INSERT INTO public.transaccion_recurso
    (solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada,monto_acordado,moneda,iniciada_en)
    SELECT $2,p.id,p.propietario_id,$3,p.modalidad,CASE WHEN p.modalidad='VENTA' THEN p.precio ELSE NULL END,p.moneda,clock_timestamp()
    FROM public.publicacion_recurso p WHERE p.id=$1 RETURNING *`,[publicationId,requestId,requesterId])).rows[0];
}
export async function setPhysicalgoodsPublicationStatus(client: PoolClient, publicationId: string, status: string) {
  await client.query('UPDATE public.publicacion_recurso SET estado_publicacion=$2 WHERE id=$1',[publicationId,status]);
}
/** Los participantes pueden cerrar el acuerdo aunque el propietario haya retirado la publicación. */
export async function lockPhysicalgoodsTransactionResource(client: PoolClient, publicationId: string, campusId: string|null) {
  return (await client.query<{ id:string; estado_publicacion:string }>(`SELECT p.id,p.estado_publicacion
    FROM public.publicacion_recurso p JOIN public.recurso_fisico r ON r.publicacion_id=p.id
    WHERE p.id=$1 AND ($2::uuid IS NULL OR p.campus_id=$2) AND p.tipo_recurso='FISICO' FOR UPDATE OF p,r`,[publicationId,campusId])).rows[0] ?? null;
}
export async function countOwnPhysicalgoodsTransactions(client:PoolClient,userId:string) {
  const row=(await client.query<{active:number;finished:number}>(`SELECT
    COUNT(*) FILTER (WHERE t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION'))::int AS active,
    COUNT(*) FILTER (WHERE t.estado_transaccion IN ('COMPLETADA','CANCELADA'))::int AS finished
    FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
    JOIN public.recurso_fisico r ON r.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
    WHERE (t.propietario_id=$1 OR t.receptor_id=$1) AND p.tipo_recurso='FISICO'`,[userId])).rows[0];
  return {active:Number(row.active),finished:Number(row.finished)};
}
export async function listOwnPhysicalgoodsTransactions(client:PoolClient,userId:string,pagination:PaginationParams,tab?:'active'|'finished') {
  const status=tab==='active'?"AND t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION')":tab==='finished'?"AND t.estado_transaccion IN ('COMPLETADA','CANCELADA')":'';
  const order=tab==='finished'?'COALESCE(t.completada_en,t.cancelada_en,t.iniciada_en)':'t.iniciada_en';
  return (await client.query<PhysicalgoodsTransactionDetailRow>(`SELECT t.id,t.publicacion_id,t.propietario_id,t.receptor_id,
    t.estado_transaccion,t.modalidad_acordada,t.monto_acordado,t.moneda,p.titulo,p.estado_publicacion,p.deleted_at,p.campus_id,c.nombre AS campus_nombre,
    to_char(t.iniciada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS iniciada_en
    FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
    JOIN public.recurso_fisico r ON r.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
    WHERE (t.propietario_id=$1 OR t.receptor_id=$1) AND p.tipo_recurso='FISICO' ${status}
    ORDER BY ${order} DESC,t.id DESC LIMIT $2 OFFSET $3`,[userId,pagination.limit+1,pagination.offset])).rows;
}
export async function findPhysicalgoodsTransaction(client: PoolClient, publicationId: string, transactionId: string) {
  return (await client.query<PhysicalgoodsTransactionRow>('SELECT * FROM public.transaccion_recurso WHERE publicacion_id=$1 AND id=$2 FOR UPDATE',
    [publicationId,transactionId])).rows[0] ?? null;
}
export async function physicalgoodsConfirmations(client: PoolClient, transactionId: string) {
  return (await client.query<PhysicalgoodsConfirmationRow>(
    `SELECT ${confirmationProjection} FROM public.confirmacion_transaccion WHERE transaccion_id=$1 ORDER BY confirmado_en,id`,[transactionId])).rows;
}
export async function insertPhysicalgoodsConfirmation(client: PoolClient, transactionId: string, userId: string, role: 'PROPIETARIO'|'RECEPTOR') {
  return (await client.query<PhysicalgoodsConfirmationRow>(`INSERT INTO public.confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante,confirmado_en)
    VALUES($1,$2,$3,clock_timestamp()) RETURNING ${confirmationProjection}`,[transactionId,userId,role])).rows[0];
}
export async function physicalgoodsTransactionDetail(client: PoolClient, transactionId: string) {
  return (await client.query<PhysicalgoodsTransactionDetailRow>(`SELECT t.*,p.titulo,p.estado_publicacion,p.deleted_at,p.campus_id,
    c.nombre AS campus_nombre,o.nombre_completo AS propietario_nombre,r.nombre_completo AS receptor_nombre,
    to_char(t.iniciada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS iniciada_en,
    to_char(t.completada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completada_en,
    to_char(t.cancelada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cancelada_en
    FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
    JOIN public.campus c ON c.id=p.campus_id JOIN public.perfil_usuario o ON o.id=t.propietario_id
    JOIN public.perfil_usuario r ON r.id=t.receptor_id WHERE t.id=$1`,[transactionId])).rows[0];
}
export async function physicalgoodsCoordinationMessages(client: PoolClient, publicationId: string, transactionId: string, participants: string[], pagination: PaginationParams) {
  return (await client.query<PhysicalgoodsCoordinationRow>(`SELECT ${messageProjection} FROM public.notificacion
    WHERE transaccion_id=$1 AND publicacion_id=$2 AND tipo_notificacion='COORDINACION_RECURSO'
    AND destinatario_id=ANY($3::uuid[]) AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5`,
    [transactionId,publicationId,participants,pagination.limit+1,pagination.offset])).rows;
}
export async function insertPhysicalgoodsCoordination(client: PoolClient, publicationId: string, transactionId: string, recipientId: string, message: string) {
  return (await client.query<PhysicalgoodsCoordinationRow>(`INSERT INTO public.notificacion
    (publicacion_id,transaccion_id,destinatario_id,tipo_notificacion,titulo,mensaje,created_at)
    VALUES($1,$2,$3,'COORDINACION_RECURSO','Coordinación del intercambio',$4,clock_timestamp()) RETURNING ${messageProjection}`,
    [publicationId,transactionId,recipientId,message])).rows[0];
}
export async function updatePhysicalgoodsTransactionStatus(client: PoolClient, transactionId: string, status: 'PENDIENTE_CONFIRMACION'|'COMPLETADA'|'CANCELADA', actorId: string) {
  await client.query(`UPDATE public.transaccion_recurso SET estado_transaccion=$2,
    completada_en=CASE WHEN $2='COMPLETADA' THEN clock_timestamp() ELSE completada_en END,
    cancelada_en=CASE WHEN $2='CANCELADA' THEN clock_timestamp() ELSE cancelada_en END,
    cancelada_por_id=CASE WHEN $2='CANCELADA' THEN $3::uuid ELSE cancelada_por_id END,
    motivo_cancelacion=CASE WHEN $2='CANCELADA' THEN 'USUARIO_DESISTE' ELSE motivo_cancelacion END WHERE id=$1`,[transactionId,status,actorId]);
}
