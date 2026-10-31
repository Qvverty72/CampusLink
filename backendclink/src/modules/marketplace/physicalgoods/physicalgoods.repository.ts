import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import type { DependencyChecks } from '../../../shared/health/health.types.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { createServerSupabaseClient } from '../../../database/supabase/client.js';
import type { PoolClient } from 'pg';
import type { PhysicalgoodsCatalog, PhysicalgoodsCreated, PhysicalgoodsInput, PrincipalPhoto } from './physicalgoods.types.js';

// Bucket privado existente en Storage; las rutas siempre las genera el servidor.
export const PHYSICALGOODS_BUCKET = 'publication-images';
export const withPhysicalgoodsTransaction = withPostgresTransaction;
export async function updatePhysicalgoodsContent(client: PoolClient, id: string, input: Pick<PhysicalgoodsInput,'title'|'description'|'condition'|'modality'|'price'>) {
  await client.query('UPDATE public.publicacion_recurso SET titulo=$2,descripcion=$3,modalidad=$4,precio=$5 WHERE id=$1',
    [id,input.title,input.description,input.modality,input.price]);
  await client.query('UPDATE public.recurso_fisico SET estado_uso=$2 WHERE publicacion_id=$1', [id,input.condition]);
}
export async function retirePhysicalgoods(client: PoolClient, id: string) {
  await client.query('UPDATE public.publicacion_recurso SET deleted_at=clock_timestamp() WHERE id=$1', [id]);
}

export { lockAccountContext as lockPhysicalgoodsPublisher } from '../../auth/repositories/auth.repository.js';

export async function findPhysicalgoodsCatalog(client: PoolClient, campusId: string): Promise<PhysicalgoodsCatalog> {
  const campus = (await client.query<NonNullable<PhysicalgoodsCatalog['campus']>>(
    'SELECT id,nombre,institucion_id,activo FROM public.campus WHERE id=$1 FOR SHARE', [campusId])).rows[0] ?? null;
  const categories = (await client.query<{ id: string; name: string }>(
    'SELECT id,nombre AS name FROM public.categoria_recurso_fisico WHERE activo=true ORDER BY nombre FOR SHARE')).rows;
  const careers = (await client.query<{ id: string; name: string }>(
    `SELECT c.id,c.nombre AS name FROM public.carrera c JOIN public.campus_carrera cc ON cc.carrera_id=c.id
     JOIN public.campus cp ON cp.id=cc.campus_id WHERE cc.campus_id=$1 AND c.institucion_id=cp.institucion_id
     AND c.activo=true ORDER BY c.nombre FOR SHARE OF c,cc`, [campusId])).rows;
  const subjects = (await client.query<PhysicalgoodsCatalog['subjects'][number]>(
    `SELECT a.id,a.nombre AS name,array_agg(c.id ORDER BY c.id) AS "careerIds" FROM public.asignatura a
     JOIN public.carrera_asignatura ca ON ca.asignatura_id=a.id JOIN public.carrera c ON c.id=ca.carrera_id
     JOIN public.campus_carrera cc ON cc.carrera_id=c.id JOIN public.campus cp ON cp.id=cc.campus_id
     WHERE cc.campus_id=$1 AND c.institucion_id=cp.institucion_id AND c.activo=true AND a.activo=true
     GROUP BY a.id,a.nombre ORDER BY a.nombre`, [campusId])).rows;
  return { campus, categories, careers, subjects };
}

export async function insertPhysicalgoods(client: PoolClient, publication: PhysicalgoodsCreated, photo: PrincipalPhoto, path: string) {
  await client.query(
    `INSERT INTO public.publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo,descripcion,modalidad,precio,moneda,estado_publicacion)
     VALUES($1,$2,$3,'FISICO',$4,$5,$6,$7,'CLP','DISPONIBLE')`,
    [publication.id, publication.campusId, publication.ownerId, publication.title, publication.description, publication.modality, publication.price]);
  await client.query('INSERT INTO public.recurso_fisico(publicacion_id,categoria_id,estado_uso) VALUES($1,$2,$3)',
    [publication.id, publication.categoryId, publication.condition]);
  await client.query(
    `INSERT INTO public.archivo_publicacion(publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
     VALUES($1,$2,$3,$4,$5,$6,'IMAGEN',0)`, [publication.id, PHYSICALGOODS_BUCKET, path, photo.name, photo.mimeType, photo.bytes.length]);
  if (publication.careerId) await client.query('INSERT INTO public.publicacion_carrera(publicacion_id,carrera_id) VALUES($1,$2)', [publication.id, publication.careerId]);
  if (publication.subjectId) await client.query('INSERT INTO public.publicacion_asignatura(publicacion_id,asignatura_id) VALUES($1,$2)', [publication.id, publication.subjectId]);
}

export async function uploadPrincipalPhoto(path: string, photo: PrincipalPhoto) {
  // Rechaza buckets públicos antes de escribir; las fotos solo se exponen mediante enlaces firmados.
  const storage = createServerSupabaseClient().storage;
  const bucket = await storage.getBucket(PHYSICALGOODS_BUCKET);
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error('Private publication bucket unavailable');
  const result = await storage.from(PHYSICALGOODS_BUCKET).upload(path, photo.bytes, { contentType: photo.mimeType, upsert: false });
  if (result.error) throw new Error('Photo upload unavailable');
}

export async function removePrincipalPhoto(path: string) {
  const result = await createServerSupabaseClient().storage.from(PHYSICALGOODS_BUCKET).remove([path]);
  if (result.error) throw new Error('Photo cleanup unavailable');
}

export async function principalPhotoHasReference(path: string) {
  return withPostgresTransaction(async client => (await client.query<{ referenced: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM public.archivo_publicacion WHERE bucket_id=$1 AND storage_path=$2) AS referenced',
    [PHYSICALGOODS_BUCKET, path])).rows[0].referenced);
}

export async function findPrincipalPhoto(client: PoolClient, publicationId: string, campusId: string) {
  return (await client.query<{ bucket_id: string; storage_path: string }>(
    `SELECT a.bucket_id,a.storage_path FROM public.publicacion_recurso p
     JOIN public.recurso_fisico r ON r.publicacion_id=p.id JOIN public.archivo_publicacion a ON a.publicacion_id=p.id
     WHERE p.id=$1 AND p.campus_id=$2 AND p.tipo_recurso='FISICO' AND p.deleted_at IS NULL
     AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO','FINALIZADO') AND a.deleted_at IS NULL AND a.tipo_archivo='IMAGEN'
     ORDER BY a.orden,a.created_at LIMIT 1`, [publicationId, campusId])).rows[0] ?? null;
}

export async function signPrincipalPhoto(path: string) {
  const result = await createServerSupabaseClient().storage.from(PHYSICALGOODS_BUCKET).createSignedUrl(path, 60);
  if (result.error || !result.data) throw new Error('Photo access unavailable');
  return result.data.signedUrl;
}

export async function signPhysicalgoodsSearchPhotos(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const result = await createServerSupabaseClient().storage.from(PHYSICALGOODS_BUCKET).createSignedUrls(paths, 60);
  if (result.error || result.data.length !== paths.length) throw new Error('Photo access unavailable');
  const urls = new Map<string, string>();
  for (const photo of result.data) {
    if (photo.error || !photo.path || !paths.includes(photo.path) || !photo.signedUrl) throw new Error('Photo access unavailable');
    urls.set(photo.path, photo.signedUrl);
  }
  if (urls.size !== paths.length) throw new Error('Photo access unavailable');
  return urls;
}

export function probePhysicalgoodsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"publicacion_recurso","resourceType":"FISICO"},{"table":"recurso_fisico","column":"publicacion_id"}]),
  });
}
