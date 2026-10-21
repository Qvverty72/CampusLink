import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import type { DependencyChecks } from '../../../types/api.types.js';
import type { PoolClient } from 'pg';
import { createServerSupabaseClient } from '../../../database/supabase/client.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import type { DigitalPublication, DigitalResourceRow, DigitalStoredFile, DigitalUpload } from './elibrary.types.js';
import type { DigitalSearch } from './elibrary.search.service.js';

export const DIGITAL_BUCKET = 'digital-resources';
/** Predicado común para derechos existentes: solicitud/visibilidad por sí solas no conceden acceso. */
export const DIGITAL_ACCESS_PROOF = `t.publicacion_id=a.publicacion_id AND t.receptor_id=a.receptor_id AND t.estado_transaccion='COMPLETADA'
  AND EXISTS(SELECT 1 FROM public.confirmacion_transaccion confirm WHERE confirm.transaccion_id=t.id AND confirm.rol_confirmante='PROPIETARIO' AND confirm.usuario_id=t.propietario_id)
  AND EXISTS(SELECT 1 FROM public.confirmacion_transaccion confirm WHERE confirm.transaccion_id=t.id AND confirm.rol_confirmante='RECEPTOR' AND confirm.usuario_id=t.receptor_id)`;
export async function findDigitalCampus(client: PoolClient, campusId: string) {
  return (await client.query<{ id: string; nombre: string; institucion_id: string; activo: boolean }>(
    `SELECT c.id,c.nombre,c.institucion_id,c.activo FROM public.campus c
     JOIN public.institucion i ON i.id=c.institucion_id WHERE c.id=$1 FOR SHARE OF c,i`, [campusId])).rows[0] ?? null;
}
/** La misma barrera permite esperar una transacción cuyo COMMIT haya perdido la respuesta. */
export async function lockDigitalPersistence(client: PoolClient, id: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [id]);
}
export async function insertDigitalPublication(client: PoolClient,
  publication: Pick<DigitalPublication, 'id' | 'campusId' | 'ownerId' | 'title' | 'description' | 'modality' | 'price'>,
  file: DigitalUpload, path: string) {
  await client.query(
    `INSERT INTO public.publicacion_recurso(id,campus_id,propietario_id,tipo_recurso,titulo,descripcion,modalidad,precio,moneda,estado_publicacion)
     VALUES($1,$2,$3,'DIGITAL',$4,$5,$6,$7,'CLP','DISPONIBLE')`,
    [publication.id, publication.campusId, publication.ownerId, publication.title, publication.description, publication.modality, publication.price]);
  await client.query('INSERT INTO public.recurso_digital(publicacion_id) VALUES($1)', [publication.id]);
  const attachment = await client.query<{ id: string }>(
    `INSERT INTO public.archivo_publicacion(publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
     VALUES($1,$2,$3,$4,$5,$6,'RECURSO',0) RETURNING id`, [publication.id, DIGITAL_BUCKET, path, file.name, file.mimeType, file.bytes.length]);
  return { id: attachment.rows[0].id, name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.length };
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
export async function findDigitalPublications(client: PoolClient, institutionId: string, id: string | null = null, filters?: DigitalSearch, viewerId: string | null = null): Promise<DigitalPublication[]> {
  return (await client.query<Omit<DigitalPublication, 'careerIds' | 'subjectIds'>>(
    `SELECT p.id,p.titulo AS title,p.descripcion AS description,p.modalidad AS modality,p.precio::float8 AS price,
      to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
      p.moneda AS currency,p.estado_publicacion AS status,p.propietario_id AS "ownerId",p.campus_id AS "campusId",
      c.nombre AS "campusName",c.institucion_id AS "institutionId",
      EXISTS(SELECT 1 FROM public.acceso_recurso_digital a JOIN public.transaccion_recurso t ON t.id=a.transaccion_id
        WHERE a.publicacion_id=p.id AND a.receptor_id=$9 AND t.propietario_id=p.propietario_id AND ${DIGITAL_ACCESS_PROOF}) AS acquired,
      COALESCE((SELECT json_agg(json_build_object('id',c.id,'name',c.nombre,'code',c.codigo) ORDER BY c.nombre,c.id)
       FROM public.publicacion_carrera pc JOIN public.carrera c ON c.id=pc.carrera_id
       WHERE pc.publicacion_id=p.id AND c.institucion_id=$1),'[]'::json) AS careers,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'name',a.nombre,'code',a.codigo) ORDER BY a.nombre,a.id)
       FROM public.publicacion_asignatura pa JOIN public.asignatura a ON a.id=pa.asignatura_id
       WHERE pa.publicacion_id=p.id),'[]'::json) AS subjects,
      (SELECT json_agg(json_build_object('id',a.id,'name',a.nombre_original,'mimeType',a.mime_type,'sizeBytes',a.tamano_bytes) ORDER BY a.orden,a.id)
       FROM public.archivo_publicacion a WHERE a.publicacion_id=p.id AND a.deleted_at IS NULL AND a.tipo_archivo='RECURSO') AS files
     FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id
     JOIN public.campus c ON c.id=p.campus_id JOIN public.institucion i ON i.id=c.institucion_id
     WHERE c.institucion_id=$1 AND p.tipo_recurso='DIGITAL'
       AND p.estado_publicacion='DISPONIBLE' AND p.deleted_at IS NULL AND ($2::uuid IS NULL OR p.id=$2)
       AND ($3::text IS NULL OR p.titulo ILIKE $3 OR p.descripcion ILIKE $3)
       AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM public.publicacion_carrera pc WHERE pc.publicacion_id=p.id AND pc.carrera_id=$4))
       AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM public.publicacion_asignatura pa WHERE pa.publicacion_id=p.id AND pa.asignatura_id=$5))
       AND ($6::text IS NULL OR p.modalidad=$6)
       AND EXISTS(SELECT 1 FROM public.archivo_publicacion a WHERE a.publicacion_id=p.id AND a.deleted_at IS NULL AND a.tipo_archivo='RECURSO')
     ORDER BY p.publicado_en DESC,p.id DESC LIMIT $7 OFFSET $8`, [institutionId, id,
       filters?.q ? '%' + filters.q.replace(/[\\%_]/g, '\\$&') + '%' : null,
       filters?.careerId ?? null, filters?.subjectId ?? null, filters?.modality ?? null, filters ? filters.limit + 1 : 30, filters?.offset ?? 0, viewerId])).rows
    .map(row => ({ ...row, careerIds: row.careers.map(career => career.id), subjectIds: row.subjects.map(subject => subject.id) }));
}

export async function findDigitalResource(client: PoolClient, id: string, institutionId: string) {
  return (await client.query<DigitalResourceRow>(
    `SELECT p.id,p.campus_id,p.propietario_id,p.titulo AS title,p.estado_publicacion,p.deleted_at,c.institucion_id
     FROM public.publicacion_recurso p JOIN public.recurso_digital d ON d.publicacion_id=p.id
     JOIN public.campus c ON c.id=p.campus_id
     WHERE p.id=$1 AND p.tipo_recurso='DIGITAL' AND c.institucion_id=$2 FOR NO KEY UPDATE OF p`, [id, institutionId])).rows[0] ?? null;
}
export async function insertDigitalAttachment(client: PoolClient, publicationId: string, id: string, path: string, file: DigitalUpload) {
  const order = Number((await client.query<{ next_order: number }>(
    'SELECT COALESCE(MAX(orden),-1)+1 AS next_order FROM public.archivo_publicacion WHERE publicacion_id=$1', [publicationId])).rows[0].next_order);
  if (order > 32767) return null;
  await client.query(
    `INSERT INTO public.archivo_publicacion(id,publicacion_id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes,tipo_archivo,orden)
     VALUES($1,$2,$3,$4,$5,$6,$7,'RECURSO',$8)`, [id, publicationId, DIGITAL_BUCKET, path, file.name, file.mimeType, file.bytes.length, order]);
  await client.query('UPDATE public.publicacion_recurso SET updated_at=clock_timestamp() WHERE id=$1', [publicationId]);
  return { id, name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.length };
}
export async function findDigitalFile(client: PoolClient, publicationId: string, fileId: string) {
  return (await client.query<DigitalStoredFile>(
    `SELECT id,bucket_id,storage_path,nombre_original,mime_type,tamano_bytes FROM public.archivo_publicacion
     WHERE id=$1 AND publicacion_id=$2 AND tipo_archivo='RECURSO' AND deleted_at IS NULL FOR SHARE`, [fileId, publicationId])).rows[0] ?? null;
}
/** Solo comprueba derechos existentes; no crea solicitudes, transacciones ni adquisiciones. */
export async function hasDigitalAcquisition(client: PoolClient, publicationId: string, ownerId: string, receiverId: string) {
  return (await client.query<{ granted: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM public.acceso_recurso_digital a JOIN public.transaccion_recurso t ON t.id=a.transaccion_id
       WHERE a.publicacion_id=$1 AND a.receptor_id=$2 AND t.propietario_id=$3 AND ${DIGITAL_ACCESS_PROOF}) AS granted`,
    [publicationId, receiverId, ownerId])).rows[0].granted;
}
export async function downloadDigitalOriginal(file: DigitalStoredFile) {
  const result = await createServerSupabaseClient().storage.from(DIGITAL_BUCKET).download(file.storage_path);
  if (result.error || !result.data || result.data.size !== Number(file.tamano_bytes)) throw new Error('Digital original unavailable');
  return Buffer.from(await result.data.arrayBuffer());
}

export function probeElibraryDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"publicacion_recurso","resourceType":"DIGITAL"},{"table":"recurso_digital","column":"publicacion_id"}]),
  });
}
