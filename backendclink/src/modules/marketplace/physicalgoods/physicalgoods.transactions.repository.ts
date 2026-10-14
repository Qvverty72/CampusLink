import type { PoolClient } from 'pg';
import type { PhysicalgoodsTransactionRow } from './physicalgoods.types.js';

export async function hasActivePhysicalgoodsTransaction(client: PoolClient, publicationId: string) {
  return (await client.query(`SELECT id FROM public.transaccion_recurso WHERE publicacion_id=$1
    AND estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION') LIMIT 1`,[publicationId])).rows.length > 0;
}
export async function insertPhysicalgoodsTransaction(client: PoolClient, publicationId: string, requestId: string, requesterId: string) {
  return (await client.query<PhysicalgoodsTransactionRow>(`INSERT INTO public.transaccion_recurso
    (solicitud_id,publicacion_id,propietario_id,receptor_id,modalidad_acordada,monto_acordado,moneda)
    SELECT $2,p.id,p.propietario_id,$3,p.modalidad,CASE WHEN p.modalidad='VENTA' THEN p.precio ELSE NULL END,p.moneda
    FROM public.publicacion_recurso p WHERE p.id=$1 RETURNING *`,[publicationId,requestId,requesterId])).rows[0];
}
export async function setPhysicalgoodsPublicationStatus(client: PoolClient, publicationId: string, status: string) {
  await client.query('UPDATE public.publicacion_recurso SET estado_publicacion=$2 WHERE id=$1',[publicationId,status]);
}
/** Los participantes pueden cerrar el acuerdo aunque el propietario haya retirado la publicación. */
export async function lockPhysicalgoodsTransactionResource(client: PoolClient, publicationId: string, campusId: string) {
  return (await client.query<{ id:string; estado_publicacion:string }>(`SELECT p.id,p.estado_publicacion
    FROM public.publicacion_recurso p JOIN public.recurso_fisico r ON r.publicacion_id=p.id
    WHERE p.id=$1 AND p.campus_id=$2 AND p.tipo_recurso='FISICO' FOR UPDATE OF p,r`,[publicationId,campusId])).rows[0] ?? null;
}
export async function findPhysicalgoodsTransaction(client: PoolClient, publicationId: string, transactionId: string) {
  return (await client.query<PhysicalgoodsTransactionRow>('SELECT * FROM public.transaccion_recurso WHERE publicacion_id=$1 AND id=$2 FOR UPDATE',
    [publicationId,transactionId])).rows[0] ?? null;
}
export async function physicalgoodsConfirmations(client: PoolClient, transactionId: string) {
  return (await client.query<{ usuario_id:string; rol_confirmante:'PROPIETARIO'|'RECEPTOR' }>(
    'SELECT usuario_id,rol_confirmante FROM public.confirmacion_transaccion WHERE transaccion_id=$1',[transactionId])).rows;
}
export async function insertPhysicalgoodsConfirmation(client: PoolClient, transactionId: string, userId: string, role: 'PROPIETARIO'|'RECEPTOR') {
  await client.query('INSERT INTO public.confirmacion_transaccion(transaccion_id,usuario_id,rol_confirmante) VALUES($1,$2,$3)',[transactionId,userId,role]);
}
export async function updatePhysicalgoodsTransactionStatus(client: PoolClient, transactionId: string, status: 'PENDIENTE_CONFIRMACION'|'COMPLETADA'|'CANCELADA', actorId: string) {
  await client.query(`UPDATE public.transaccion_recurso SET estado_transaccion=$2,
    completada_en=CASE WHEN $2='COMPLETADA' THEN clock_timestamp() ELSE completada_en END,
    cancelada_en=CASE WHEN $2='CANCELADA' THEN clock_timestamp() ELSE cancelada_en END,
    cancelada_por_id=CASE WHEN $2='CANCELADA' THEN $3::uuid ELSE cancelada_por_id END WHERE id=$1`,[transactionId,status,actorId]);
}
