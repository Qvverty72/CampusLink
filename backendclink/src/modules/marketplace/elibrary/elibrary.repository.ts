import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import type { DependencyChecks } from '../../../types/api.types.js';
import type { PoolClient } from 'pg';
import { createServerSupabaseClient } from '../../../database/supabase/client.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import type { DigitalPublication, DigitalUpload } from './elibrary.types.js';

export const DIGITAL_BUCKET = 'digital-resources';
export async function findDigitalCampus(client: PoolClient, campusId: string) {
  return (await client.query<{ id: string; nombre: string; institucion_id: string; activo: boolean }>(
    `SELECT c.id,c.nombre,c.institucion_id,c.activo FROM public.campus c
     JOIN public.institucion i ON i.id=c.institucion_id WHERE c.id=$1 FOR SHARE OF c,i`, [campusId])).rows[0] ?? null;
}
/** La misma barrera permite esperar una transacción cuyo COMMIT haya perdido la respuesta. */
export async function lockDigitalPersistence(client: PoolClient, id: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
}
export async function insertDigitalPublication(client: PoolClient, publication: DigitalPublication, file: DigitalUpload, path: string) {
  await client.query(
    `INSERT INTO public.publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo,descripcion,modalidad,precio,moneda,estado_publicacion)
     VALUES($1,$2,$3,'DIGITAL',$4,$5,$6,$7,'CLP','DISPONIBLE')`,
    [publication.id, publication.campusId, publication.ownerId, publication.title, publication.description, publication.modality, publication.price]);
  await client.query('INSERT INTO public.recurso_digital(publicacion_id) VALUES($1)', [publication.id]);
  await client.query(
    `INSERT INTO public.archivo_publicacion(publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
     VALUES($1,$2,$3,$4,$5,$6,'RECURSO',0)`, [publication.id, DIGITAL_BUCKET, path, file.name, file.mimeType, file.bytes.length]);
}
export async function uploadDigitalFile(path: string, file: DigitalUpload) {
  const storage = createServerSupabaseClient().storage;
  const { data, error } = await storage.getBucket(DIGITAL_BUCKET);
  if (error || !data || data.public || (data.file_size_limit != null && Number(data.file_size_limit) < file.bytes.length)
    || (data.allowed_mime_types && !data.allowed_mime_types.includes(file.mimeType))) throw new Error('Private digital bucket unavailable');
  const result = await storage.from(DIGITAL_BUCKET).upload(path, file.bytes, { contentType: file.mimeType, upsert: false });
  if (result.error) throw new Error('Digital upload unavailable');
}
export async function removeDigitalFile(path: string) {
  const result = await createServerSupabaseClient().storage.from(DIGITAL_BUCKET).remove([path]);
  if (result.error) throw new Error('Digital cleanup unavailable');
}
export async function digitalFileHasReference(id: string, path: string) {
  return withPostgresTransaction(async client => {
    await lockDigitalPersistence(client, id);
    return (await client.query<{ referenced: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM public.archivo_publicacion WHERE bucket_id=$1 AND storage_path=$2) AS referenced`,
      [DIGITAL_BUCKET, path])).rows[0].referenced;
  });
}
/** Proyección pública institucional: nunca selecciona bucket, path ni enlaces del original. */
export async function findDigitalPublications(client: PoolClient, institutionId: string, id: string | null = null): Promise<DigitalPublication[]> {
  return (await client.query<DigitalPublication>(
    `SELECT p.id,p.titulo AS title,p.descripcion AS description,p.modalidad AS modality,p.precio::float8 AS price,
      p.moneda AS currency,p.estado_publicacion AS status,p.propietario_id AS "ownerId",p.campus_id AS "campusId",
      c.nombre AS "campusName",c.institucion_id AS "institutionId",
      (SELECT json_agg(json_build_object('name',a.nombre_original,'mimeType',a.mime_type,'sizeBytes',a.tamano_bytes) ORDER BY a.orden,a.id)
       FROM public.archivo_publicacion a WHERE a.publicacion_id=p.id AND a.deleted_at IS NULL AND a.tipo_archivo='RECURSO') AS files
     FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id
     JOIN public.campus c ON c.id=p.campus_id JOIN public.institucion i ON i.id=c.institucion_id
     WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL'
       AND p.estado_publicacion='DISPONIBLE' AND p.deleted_at IS NULL AND ($2::uuid IS NULL OR p.id=$2)
       AND EXISTS(SELECT 1 FROM public.archivo_publicacion a WHERE a.publicacion_id=p.id AND a.deleted_at IS NULL AND a.tipo_archivo='RECURSO')
     ORDER BY p.publicado_en DESC,p.id DESC LIMIT 30`, [institutionId, id])).rows;
}

export function probeElibraryDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"publicacion_recurso","resourceType":"DIGITAL"},{"table":"recurso_digital","column":"publicacion_id"}]),
  });
}
