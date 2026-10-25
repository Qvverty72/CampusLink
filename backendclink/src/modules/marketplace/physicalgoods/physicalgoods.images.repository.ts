import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../../types/api.js';
import type { PhysicalgoodsDetailRow, PhysicalgoodsImageRow, PhysicalgoodsMediaRow, PhysicalgoodsOwnRow, PhysicalgoodsSearchFilters, PhysicalgoodsSearchRow, PrincipalPhoto } from './physicalgoods.types.js';
import { PHYSICALGOODS_BUCKET } from './physicalgoods.repository.js';

const mediaProjection = `p.id,p.campus_id,p.propietario_id,p.titulo,p.descripcion,p.modalidad,p.precio,p.estado_publicacion,
  to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
  r.categoria_id,r.estado_uso,c.nombre AS categoria_nombre`;
const mediaJoins = `FROM public.publicacion_recurso p JOIN public.recurso_fisico r ON r.publicacion_id=p.id
  JOIN public.categoria_recurso_fisico c ON c.id=r.categoria_id`;

export async function findPhysicalgoodsMedia(client: PoolClient, publicationId: string, campusId: string, lock = false) {
  return (await client.query<PhysicalgoodsMediaRow>(`SELECT ${mediaProjection} ${mediaJoins}
    WHERE p.id=$1 AND p.campus_id=$2 AND p.tipo_recurso='FISICO' AND p.deleted_at IS NULL
    AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO','FINALIZADO') ${lock ? 'FOR UPDATE OF p,r' : ''}`, [publicationId, campusId])).rows[0] ?? null;
}
export async function findPhysicalgoodsDetail(client: PoolClient, publicationId: string, campusId: string) {
  return (await client.query<PhysicalgoodsDetailRow>(`SELECT ${mediaProjection},
    campus.nombre AS campus_nombre,owner.nombre_completo AS propietario_nombre,
    ARRAY(SELECT career.nombre FROM public.usuario_carrera membership JOIN public.carrera career ON career.id=membership.carrera_id
      WHERE membership.perfil_usuario_id=owner.id AND career.institucion_id=owner.institucion_id
        AND career.institucion_id=campus.institucion_id ORDER BY career.nombre,career.id) AS propietario_carreras ${mediaJoins}
    JOIN public.campus campus ON campus.id=p.campus_id JOIN public.perfil_usuario owner ON owner.id=p.propietario_id
    WHERE p.id=$1 AND p.campus_id=$2 AND p.tipo_recurso='FISICO' AND p.deleted_at IS NULL
    AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO','FINALIZADO')`, [publicationId, campusId])).rows[0] ?? null;
}
/** Agregados públicos físicos del propietario, solo en el campus del detalle ya autorizado. */
export async function findPhysicalgoodsOwnerReputation(client: PoolClient, ownerId: string, campusId: string) {
  return (await client.query<{ averageRating: number | null; ratingCount: number; completedAgreements: number; completedSales: number }>(
    `SELECT avg(rating.puntuacion)::float8 AS "averageRating",count(rating.id)::int AS "ratingCount",count(*)::int AS "completedAgreements",
       count(*) FILTER(WHERE agreement.modalidad_acordada='VENTA')::int AS "completedSales"
     FROM public.transaccion_recurso agreement
     JOIN public.publicacion_recurso resource ON resource.id=agreement.publicacion_id
     JOIN public.recurso_fisico physical ON physical.publicacion_id=resource.id
     LEFT JOIN public.valoracion rating ON rating.transaccion_id=agreement.id
       AND rating.evaluado_id=agreement.propietario_id AND rating.evaluador_id=agreement.receptor_id
       AND rating.puntuacion BETWEEN 1 AND 5
     WHERE agreement.propietario_id=$1 AND resource.propietario_id=$1 AND resource.campus_id=$2
       AND resource.tipo_recurso='FISICO' AND agreement.estado_transaccion='COMPLETADA'
       AND EXISTS(SELECT 1 FROM public.confirmacion_transaccion confirmation WHERE confirmation.transaccion_id=agreement.id
         AND confirmation.usuario_id=agreement.propietario_id AND confirmation.rol_confirmante='PROPIETARIO')
       AND EXISTS(SELECT 1 FROM public.confirmacion_transaccion confirmation WHERE confirmation.transaccion_id=agreement.id
         AND confirmation.usuario_id=agreement.receptor_id AND confirmation.rol_confirmante='RECEPTOR')`, [ownerId, campusId])).rows[0];
}
/** Historial del propietario: no filtra disponibilidad ni traslada el campus de origen. */
export async function listOwnPhysicalgoods(client: PoolClient, userId: string, pagination: PaginationParams,tab?:'all'|'active'|'reserved'|'finished',currentCampusId?:string) {
  const filter=tab==='active'?"AND p.deleted_at IS NULL AND p.estado_publicacion='DISPONIBLE'":tab==='reserved'?"AND p.deleted_at IS NULL AND p.estado_publicacion='RESERVADO'":tab==='finished'?"AND p.estado_publicacion='FINALIZADO'":'';
  const priority=tab?`CASE WHEN p.campus_id=$4 AND p.deleted_at IS NULL AND p.estado_publicacion='DISPONIBLE'
    AND EXISTS(SELECT 1 FROM public.solicitud_recurso s WHERE s.publicacion_id=p.id AND s.estado_solicitud='PENDIENTE') THEN 0
    WHEN p.campus_id=$4 AND p.deleted_at IS NULL AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO') THEN 1 ELSE 2 END,`:'';
  return (await client.query<PhysicalgoodsOwnRow>(`SELECT ${mediaProjection},p.deleted_at,
    (SELECT count(*)::int FROM public.solicitud_recurso request WHERE request.publicacion_id=p.id AND request.estado_solicitud='PENDIENTE') AS pending_requests,
    to_char(p.publicado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS publicado_en,
    campus.nombre AS campus_nombre,owner.nombre_completo AS propietario_nombre ${mediaJoins}
    JOIN public.campus campus ON campus.id=p.campus_id JOIN public.perfil_usuario owner ON owner.id=p.propietario_id
    WHERE p.propietario_id=$1 AND p.tipo_recurso='FISICO' ${filter}
    ORDER BY ${priority} p.publicado_en DESC,p.id DESC LIMIT $2 OFFSET $3`,[userId,pagination.limit+1,pagination.offset,...(tab?[currentCampusId??null]:[])])).rows;
}
export async function findOwnPhysicalgoods(client: PoolClient, publicationId: string, userId: string) {
  return (await client.query<PhysicalgoodsOwnRow>(`SELECT ${mediaProjection},p.deleted_at,
    (SELECT count(*)::int FROM public.solicitud_recurso request WHERE request.publicacion_id=p.id AND request.estado_solicitud='PENDIENTE') AS pending_requests,
    to_char(p.publicado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS publicado_en,
    campus.nombre AS campus_nombre,owner.nombre_completo AS propietario_nombre ${mediaJoins}
    JOIN public.campus campus ON campus.id=p.campus_id JOIN public.perfil_usuario owner ON owner.id=p.propietario_id
    WHERE p.id=$1 AND p.propietario_id=$2 AND p.tipo_recurso='FISICO'`,[publicationId,userId])).rows[0]??null;
}
export async function listPhysicalgoodsMedia(client: PoolClient, campusId: string, filters: PhysicalgoodsSearchFilters, ownerId: string | null, pagination: PaginationParams) {
  // Trata %, _ y barras invertidas del usuario como texto literal, no como comodines SQL.
  const patterns = filters.q ? filters.q.split(' ').map(word => '%' + word.replace(/[\\%_]/g, '\\$&') + '%') : [];
  return (await client.query<PhysicalgoodsSearchRow>(`SELECT ${mediaProjection},photo.bucket_id AS photo_bucket_id,photo.storage_path AS photo_storage_path ${mediaJoins}
    LEFT JOIN LATERAL (SELECT a.bucket_id,a.storage_path FROM public.archivo_publicacion a
      WHERE a.publicacion_id=p.id AND a.tipo_archivo='IMAGEN' AND a.orden=0 AND a.deleted_at IS NULL
      ORDER BY a.created_at,a.id LIMIT 1) photo ON true
    WHERE p.campus_id=$1 AND p.tipo_recurso='FISICO' AND p.deleted_at IS NULL AND p.estado_publicacion='DISPONIBLE'
    AND ($2::uuid IS NULL OR r.categoria_id=$2) AND ($3::uuid IS NULL OR p.propietario_id=$3)
    AND concat_ws(' ',p.titulo,p.descripcion) ILIKE ALL($4::text[])
    AND ($5::text IS NULL OR p.modalidad=$5) AND ($6::text IS NULL OR r.estado_uso=$6)
    AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM public.publicacion_carrera pc WHERE pc.publicacion_id=p.id AND pc.carrera_id=$7))
    AND ($8::uuid IS NULL OR EXISTS(SELECT 1 FROM public.publicacion_asignatura pa WHERE pa.publicacion_id=p.id AND pa.asignatura_id=$8))
    AND (($9::numeric IS NULL AND $10::numeric IS NULL) OR (p.modalidad='VENTA'
      AND ($9::numeric IS NULL OR p.precio >= $9) AND ($10::numeric IS NULL OR p.precio <= $10)))
    ORDER BY p.publicado_en DESC,p.id DESC LIMIT $11 OFFSET $12`,
    [campusId, filters.categoryId, ownerId, patterns, filters.modality, filters.condition, filters.careerId, filters.subjectId,
      filters.minPrice, filters.maxPrice, pagination.limit + 1, pagination.offset])).rows;
}
export async function findPhysicalgoodsImages(client: PoolClient, publicationId: string) {
  return (await client.query<PhysicalgoodsImageRow>(`SELECT id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,orden
    FROM public.archivo_publicacion WHERE publicacion_id=$1 AND tipo_archivo='IMAGEN' AND deleted_at IS NULL
    ORDER BY orden,created_at,id`, [publicationId])).rows;
}
export async function insertPhysicalgoodsImage(client: PoolClient, publicationId: string, imageId: string, path: string, photo: PrincipalPhoto, order: number) {
  await client.query(`INSERT INTO public.archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
    VALUES($1,$2,$3,$4,$5,$6,$7,'IMAGEN',$8)`, [imageId, publicationId, PHYSICALGOODS_BUCKET, path, photo.name, photo.mimeType, photo.bytes.length, order]);
}
export async function setPhysicalgoodsPrincipal(client: PoolClient, publicationId: string, imageId: string, previousId: string, previousOrder: number) {
  await client.query(`UPDATE public.archivo_publicacion SET orden=CASE WHEN id=$2 THEN 0 ELSE $4 END
    WHERE publicacion_id=$1 AND id IN ($2,$3) AND tipo_archivo='IMAGEN' AND deleted_at IS NULL`, [publicationId, imageId, previousId, previousOrder]);
}
export async function retirePhysicalgoodsImage(client: PoolClient, publicationId: string, imageId: string) {
  await client.query("UPDATE public.archivo_publicacion SET deleted_at=clock_timestamp() WHERE publicacion_id=$1 AND id=$2 AND tipo_archivo='IMAGEN' AND deleted_at IS NULL", [publicationId, imageId]);
}
export async function updatePhysicalgoodsCategory(client: PoolClient, publicationId: string, categoryId: string) {
  await client.query('UPDATE public.recurso_fisico SET categoria_id=$2 WHERE publicacion_id=$1', [publicationId, categoryId]);
}
export async function findPhysicalgoodsCategory(client: PoolClient, categoryId: string) {
  return (await client.query<{ id: string; activo: boolean }>('SELECT id,activo FROM public.categoria_recurso_fisico WHERE id=$1 FOR SHARE', [categoryId])).rows[0] ?? null;
}
export async function touchPhysicalgoods(client: PoolClient, publicationId: string) {
  await client.query("UPDATE public.publicacion_recurso SET updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1", [publicationId]);
}
