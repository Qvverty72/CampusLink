import type { PoolClient } from 'pg';
import type { VerifiedAuthConnection } from '../../../auth/types/auth.types.js';
import type { DigitalAcademicCatalog, DigitalAcademicOption, DigitalPublication } from '../types/elibrary.types.js';

/** La asignatura conserva un único UUID aunque forme parte de varias carreras. */
export async function findDigitalAcademicCatalog(client: PoolClient, institutionId: string): Promise<DigitalAcademicCatalog> {
  const careers = (await client.query<DigitalAcademicOption>(
    `SELECT id,nombre AS name,codigo AS code FROM public.carrera
     WHERE institucion_id=$1 AND activo ORDER BY nombre,id FOR SHARE`, [institutionId])).rows;
  const rows = (await client.query<DigitalAcademicOption & { careerId: string }>(
    `SELECT a.id,a.nombre AS name,a.codigo AS code,ca.carrera_id AS "careerId"
     FROM public.asignatura a JOIN public.carrera_asignatura ca ON ca.asignatura_id=a.id
     WHERE a.activo AND ca.carrera_id=ANY($1::uuid[]) ORDER BY a.nombre,a.id,ca.carrera_id FOR SHARE OF a,ca`,
    [careers.map(row => row.id)])).rows;
  const subjects = new Map<string, DigitalAcademicCatalog['subjects'][number]>();
  for (const { careerId, ...subject } of rows) {
    const existing = subjects.get(subject.id);
    if (existing) existing.careerIds.push(careerId);
    else subjects.set(subject.id, { ...subject, careerIds: [careerId] });
  }
  return { careers, subjects: [...subjects.values()] };
}

export async function replaceDigitalAcademics(client: PoolClient, id: string, careerIds: string[], subjectIds: string[]) {
  await client.query('DELETE FROM public.publicacion_carrera WHERE publicacion_id=$1 AND NOT(carrera_id=ANY($2::uuid[]))', [id, careerIds]);
  await client.query('DELETE FROM public.publicacion_asignatura WHERE publicacion_id=$1 AND NOT(asignatura_id=ANY($2::uuid[]))', [id, subjectIds]);
  await client.query(`INSERT INTO public.publicacion_carrera(publicacion_id,carrera_id)
    SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [id, careerIds]);
  await client.query(`INSERT INTO public.publicacion_asignatura(publicacion_id,asignatura_id)
    SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING`, [id, subjectIds]);
  await client.query("UPDATE public.publicacion_recurso SET updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1", [id]);
}

/** Historial inmutable en la misma transacción, sin rutas privadas ni cambios en acuerdos. */
export async function auditDigitalAcademics(client: PoolClient, auth: VerifiedAuthConnection,
  before: DigitalPublication | null, after: DigitalPublication, action?: 'EDITAR_PUBLICACION' | 'RETIRAR_PUBLICACION') {
  const snapshot = (publication: DigitalPublication | null) => publication && ({
    id: publication.id, tipo_recurso: 'DIGITAL', propietario_id: publication.ownerId, campus_id: publication.campusId,
    institucion_id: publication.institutionId, titulo: publication.title, descripcion: publication.description,
    modalidad: publication.modality, precio: publication.price, moneda: publication.currency,
    estado_publicacion: publication.status, updated_at: publication.updatedAt, deleted_at: publication.deletedAt,
    careers: publication.careers, subjects: publication.subjects,
  });
  await client.query(`INSERT INTO public.auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,accion,datos_antes,datos_despues)
    VALUES($1,$2,$3,'publicacion_recurso',$4,$5,$6::jsonb,$7::jsonb)`,
    [auth.userId, after.institutionId, after.campusId, after.id, action ?? (before ? 'EDITAR_PUBLICACION' : 'PUBLICAR_PUBLICACION'),
      JSON.stringify(snapshot(before)), JSON.stringify(snapshot(after))]);
}
