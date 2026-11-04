import type {PoolClient} from 'pg';
import type {PaginationParams} from '../../../../shared/http/api.types.js';
import type {DigitalResourceRow,DigitalTradeRow} from '../types/elibrary.types.js';

/** Private projections: identities always come from the revalidated digital context. */
const requests=`SELECT r.id,r.publicacion_id AS "publicationId",p.titulo AS title,p.propietario_id AS "ownerId",
 r.solicitante_id AS "requesterId",u.nombre_completo AS "requesterName",o.nombre_completo AS "ownerName",
 ARRAY(SELECT ca.nombre FROM public.usuario_carrera uc JOIN public.carrera ca ON ca.id=uc.carrera_id
 WHERE uc.perfil_usuario_id=u.id AND ca.institucion_id=$1 ORDER BY ca.nombre,ca.id) AS careers,
 c.nombre AS "campusName",r.estado_solicitud AS status,m.descripcion AS message,r.codigo_mensaje AS "messageCode",
 r.solicitada_en AS "requestedAt",p.publicado_en AS "publishedAt",t.id AS "transactionId",t.estado_transaccion AS "transactionStatus",
 CASE WHEN t.id IS NULL THEN p.modalidad ELSE t.modalidad_acordada END AS modality,
 CASE WHEN t.id IS NULL THEN p.precio ELSE t.monto_acordado END::float8 AS amount,
 p.estado_publicacion AS "publicationStatus",(p.deleted_at IS NOT NULL) AS "isWithdrawn",
 (r.estado_solicitud='PENDIENTE' AND p.propietario_id=$2) AS "canResolve",
 (p.deleted_at IS NULL AND p.estado_publicacion='DISPONIBLE' AND r.estado_solicitud='PENDIENTE' AND p.propietario_id=$2) AS "canAccept"
 FROM public.solicitud_recurso r JOIN public.publicacion_recurso p ON p.id=r.publicacion_id
 JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
 JOIN public.perfil_usuario u ON u.id=r.solicitante_id JOIN public.perfil_usuario o ON o.id=p.propietario_id
 JOIN public.mensaje_solicitud m ON m.codigo=r.codigo_mensaje LEFT JOIN public.transaccion_recurso t ON t.solicitud_id=r.id
 WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL' AND (($3 AND p.propietario_id=$2) OR (NOT $3 AND r.solicitante_id=$2))`;
export interface ActivityRequest {
 id:string;publicationId:string;title:string;ownerId:string;ownerName:string;requesterId:string;requesterName:string;careers:string[];campusName:string;
 status:string;message:string;messageCode:string;requestedAt:Date|string;publishedAt:Date|string;transactionId:string|null;transactionStatus:string|null;
 modality:string;amount:number|null;publicationStatus:string;isWithdrawn:boolean;canResolve:boolean;canAccept:boolean;
}
export async function activityRequests(client:PoolClient,institutionId:string,userId:string,received:boolean,page:PaginationParams,resourceId:string|null,order:'oldest'|'newest'){
 const values=[institutionId,userId,received,resourceId];
 const where='WHERE ($4::uuid IS NULL OR "publicationId"=$4)';
 const total=(await client.query<{total:number}>(`WITH requests AS (${requests}) SELECT count(*)::int AS total FROM requests ${where}`,values)).rows[0].total;
 const direction=order==='oldest'?'ASC':'DESC';
 const rows=(await client.query<ActivityRequest>(`WITH requests AS (${requests}) SELECT * FROM requests ${where}
 ORDER BY ${resourceId?'':'CASE WHEN "transactionStatus" IN (\'COMPLETADA\',\'CANCELADA\') OR status IN (\'RECHAZADA\',\'CANCELADA\') THEN 1 ELSE 0 END,'}
 "requestedAt" ${direction},id ${direction} LIMIT $5 OFFSET $6`,[...values,page.limit,page.offset])).rows;
 return {rows,total};
}
export async function activityCounts(client:PoolClient,institutionId:string,userId:string){
 const row=(await client.query<{sentAccepted:number;receivedPending:number;pendingRequests:number}>(`WITH requests AS (${requests})
 SELECT count(*) FILTER(WHERE "requesterId"=$2 AND status='ACEPTADA' AND "transactionStatus" IN ('RESERVADA','PENDIENTE_CONFIRMACION'))::int AS "sentAccepted",
 count(*) FILTER(WHERE "ownerId"=$2 AND (status='PENDIENTE' OR (status='ACEPTADA' AND "transactionStatus" IN ('RESERVADA','PENDIENTE_CONFIRMACION'))))::int AS "receivedPending",
 count(*) FILTER(WHERE "ownerId"=$2 AND status='PENDIENTE')::int AS "pendingRequests" FROM requests`,[institutionId,userId,true])).rows[0];
 // Sent and received are different populations; the request CTE above is owner-only.
 row.sentAccepted=(await client.query<{total:number}>(`SELECT count(*)::int AS total FROM public.transaccion_recurso t
 JOIN public.publicacion_recurso p ON p.id=t.publicacion_id JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
 WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL' AND t.receptor_id=$2 AND t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION')`,[institutionId,userId])).rows[0].total;
 const totals=await activityTradeCounts(client,institutionId,userId);
 return {...row,pendingTransactions:totals.active};
}
export interface ActivityResource {publicationId:string;title:string;campusName:string;modality:string;amount:number|null;total:number;pending:number;active:number;completed:number;publishedAt:Date|string;}
export async function activityResources(client:PoolClient,institutionId:string,userId:string,page:PaginationParams){
 const base=`WITH requests AS (${requests}), resources AS (SELECT "publicationId",title,"campusName",
 count(*)::int AS total,count(*) FILTER(WHERE status='PENDIENTE')::int AS pending,
 count(*) FILTER(WHERE "transactionStatus" IN ('RESERVADA','PENDIENTE_CONFIRMACION'))::int AS active,
 count(*) FILTER(WHERE "transactionStatus"='COMPLETADA')::int AS completed,max("publishedAt") AS "publishedAt"
 FROM requests GROUP BY "publicationId",title,"campusName")`;
 const total=(await client.query<{total:number}>(`${base} SELECT count(*)::int AS total FROM resources`,[institutionId,userId,true])).rows[0].total;
 const rows=(await client.query<ActivityResource>(`${base} SELECT r.*,p.modalidad AS modality,p.precio::float8 AS amount FROM resources r
 JOIN public.publicacion_recurso p ON p.id=r."publicationId" ORDER BY CASE WHEN active>0 THEN 0 WHEN pending>0 THEN 1 ELSE 2 END,r."publishedAt" DESC,r."publicationId" DESC LIMIT $4 OFFSET $5`,[institutionId,userId,true,page.limit,page.offset])).rows;
 return {rows,total};
}
const trades=`FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
 JOIN public.recurso_digital d ON d.publicacion_id=p.id JOIN public.campus c ON c.id=p.campus_id
 WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL' AND (t.propietario_id=$2 OR t.receptor_id=$2)`;
export async function activityTradeCounts(client:PoolClient,institutionId:string,userId:string){
 return (await client.query<{active:number;finished:number}>(`SELECT count(*) FILTER(WHERE t.estado_transaccion IN ('RESERVADA','PENDIENTE_CONFIRMACION'))::int AS active,
 count(*) FILTER(WHERE t.estado_transaccion IN ('COMPLETADA','CANCELADA'))::int AS finished ${trades}`,[institutionId,userId])).rows[0];
}
export async function activityTrades(client:PoolClient,institutionId:string,userId:string,page:PaginationParams,tab:'active'|'finished'){
 return (await client.query<DigitalTradeRow&{resource:DigitalResourceRow}>(`SELECT t.*,json_build_object('id',p.id,'campus_id',p.campus_id,'propietario_id',p.propietario_id,
 'institucion_id',c.institucion_id,'title',p.titulo,'estado_publicacion',p.estado_publicacion,'deleted_at',p.deleted_at) AS resource ${trades}
 AND t.estado_transaccion::text=ANY($3::text[]) ORDER BY COALESCE(t.completada_en,t.cancelada_en,t.iniciada_en) DESC,t.id DESC LIMIT $4 OFFSET $5`,
 [institutionId,userId,tab==='active'?['RESERVADA','PENDIENTE_CONFIRMACION']:['COMPLETADA','CANCELADA'],page.limit,page.offset])).rows;
}
export async function digitalParticipantNames(client:PoolClient,ownerId:string,receiverId:string){
 const rows=(await client.query<{id:string;name:string}>('SELECT id,nombre_completo AS name FROM public.perfil_usuario WHERE id=ANY($1::uuid[])',[[ownerId,receiverId]])).rows;
 return [{id:ownerId,name:rows.find(row=>row.id===ownerId)?.name??'Propietario',role:'PROPIETARIO'},
 {id:receiverId,name:rows.find(row=>row.id===receiverId)?.name??'Receptor',role:'RECEPTOR'}];
}
