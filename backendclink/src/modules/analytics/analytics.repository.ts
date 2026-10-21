import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import { probeMongoCollections } from '../../database/mongodb/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { PoolClient } from 'pg';

export function probeAnalyticsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"evento_analitica"},{"table":"interaccion_recurso"}]),
    mongodb: () => probeMongoCollections(["activities","activity_interactions"]),
  });
}

/** Serializa vistas simultáneas y conserva una por usuario y publicación cada 24 horas. */
export async function recordResourceView(client: PoolClient, institutionId: string, campusId: string | null,
  userId: string, publicationId: string, resourceType: 'FISICO' | 'DIGITAL'): Promise<void> {
  const allowedStatus = resourceType === 'DIGITAL' ? ['DISPONIBLE'] : ['DISPONIBLE', 'RESERVADO', 'FINALIZADO'];
  const resource = await client.query<{ id: string }>(
    `SELECT p.id FROM public.publicacion_recurso p JOIN public.campus c ON c.id=p.campus_id
     WHERE p.id=$1 AND c.institucion_id=$2 AND ($3::uuid IS NULL OR p.campus_id=$3)
       AND p.tipo_recurso=$4 AND p.estado_publicacion=ANY($5::text[]) AND p.deleted_at IS NULL
       AND p.propietario_id<>$6 FOR UPDATE OF p`,
    [publicationId, institutionId, campusId, resourceType, allowedStatus, userId]);
  if (!resource.rows.length) return;
  await client.query(
    `INSERT INTO public.interaccion_recurso(perfil_usuario_id,publicacion_id,tipo_interaccion)
     SELECT $1,$2,'VISTA' WHERE NOT EXISTS (
       SELECT 1 FROM public.interaccion_recurso v WHERE v.perfil_usuario_id=$1
       AND v.publicacion_id=$2 AND v.tipo_interaccion='VISTA'
       AND v.created_at>=clock_timestamp()-interval '24 hours')`, [userId, publicationId]);
}

/**
 * Cuenta eventos ocurridos en `[from, until)` para un campus.
 * Usa el registro histórico de interacciones, no el estado JOINED actual como métrica pasada.
 */
export async function countActivityInteractions(campusId: string, from: Date, until: Date) {
  if (!campusId || !Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from) throw new Error('Invalid metric scope.');
  const { getMongoDb } = await import('../../config/mongodb.js');
  const counts = await getMongoDb().collection('activity_interactions').aggregate<{ _id: string; count: number; legacy: number }>([
    { $match: { campusId, occurredAt: { $gte: from, $lt: until }, type: { $in: ['VIEWED', 'JOINED', 'LEFT'] } } },
    { $group: { _id: '$type', count: { $sum: 1 }, legacy: { $sum: { $cond: [{ $eq: ['$provenance', 'LEGACY_STATE'] }, 1, 0] } } } },
  ]).toArray();
  return { viewed: counts.find(row => row._id === 'VIEWED')?.count ?? 0,
    joined: counts.find(row => row._id === 'JOINED')?.count ?? 0, left: counts.find(row => row._id === 'LEFT')?.count ?? 0,
    legacyEvents: counts.reduce((total, row) => total + row.legacy, 0) };
}
