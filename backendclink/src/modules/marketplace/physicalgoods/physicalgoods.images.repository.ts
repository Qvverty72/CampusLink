import type { PoolClient } from 'pg';
import type { PaginationParams } from '../../../types/api.js';
import type { PhysicalgoodsImageRow, PhysicalgoodsMediaRow, PrincipalPhoto } from './physicalgoods.types.js';
import { PHYSICALGOODS_BUCKET } from './physicalgoods.repository.js';

const mediaProjection = `p.id,p.campus_id,p.propietario_id,p.titulo,p.modalidad,p.precio,p.estado_publicacion,
  r.categoria_id,c.nombre AS categoria_nombre`;
const mediaJoins = `FROM public.publicacion_recurso p JOIN public.recurso_fisico r ON r.publicacion_id=p.id
  JOIN public.categoria_recurso_fisico c ON c.id=r.categoria_id`;

export async function findPhysicalgoodsMedia(client: PoolClient, publicationId: string, campusId: string, lock = false) {
  return (await client.query<PhysicalgoodsMediaRow>(`SELECT ${mediaProjection} ${mediaJoins}
    WHERE p.id=$1 AND p.campus_id=$2 AND p.tipo_recurso='FISICO' AND p.deleted_at IS NULL
    AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO','FINALIZADO') ${lock ? 'FOR UPDATE OF p,r' : ''}`, [publicationId, campusId])).rows[0] ?? null;
}
export async function listPhysicalgoodsMedia(client: PoolClient, campusId: string, categoryId: string | null, ownerId: string | null, pagination: PaginationParams) {
  return (await client.query<PhysicalgoodsMediaRow>(`SELECT ${mediaProjection} ${mediaJoins}
    WHERE p.campus_id=$1 AND p.tipo_recurso='FISICO' AND p.deleted_at IS NULL
    AND (p.estado_publicacion='DISPONIBLE' OR ($3::uuid IS NOT NULL AND p.estado_publicacion IN ('RESERVADO','FINALIZADO')))
    AND ($2::uuid IS NULL OR r.categoria_id=$2) AND ($3::uuid IS NULL OR p.propietario_id=$3)
    ORDER BY p.publicado_en DESC,p.id DESC LIMIT $4 OFFSET $5`, [campusId, categoryId, ownerId, pagination.limit + 1, pagination.offset])).rows;
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
