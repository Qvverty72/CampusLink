import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import { probeMongoCollections } from '../../database/mongodb/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';

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

interface DashboardScope { institutionId: string; institutionName: string; campusName: string }
interface DemandCount { views: number; requests: number }
interface SubjectDemand extends DemandCount { subjectId: string; subjectName: string }

/** Consulta los eventos SQL del campus; las asignaturas salen del ámbito guardado en cada evento. */
export async function readDashboardMetrics(campusId: string, institutionId: string, from: Date, until: Date) {
  return withPostgresTransaction(client => readDashboardMetricsFromClient(client, campusId, institutionId, from, until));
}

/** Separada del pool para verificar las fórmulas con una base SQL aislada. */
export async function readDashboardMetricsFromClient(client: PoolClient, campusId: string, institutionId: string,
  from: Date, until: Date) {
    const scope = (await client.query<DashboardScope>(
      `SELECT c.nombre AS "campusName", i.nombre AS "institutionName", i.id AS "institutionId"
       FROM public.campus c JOIN public.institucion i ON i.id=c.institucion_id
       WHERE c.id=$1 AND i.id=$2 AND c.activo=true`, [campusId, institutionId])).rows[0] ?? null;
    if (!scope) return { scope: null, activeUsers: 0, resourceDemand: { views: 0, requests: 0 }, subjectDemand: [] as SubjectDemand[] };
    const active = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM (
         SELECT DISTINCT ON (account_user_id) event_type
         FROM public.evento_analitica
         WHERE campus_id=$1 AND institution_id=$2 AND account_user_id IS NOT NULL AND occurred_at<$3
         ORDER BY account_user_id, occurred_at DESC, id DESC
       ) latest WHERE event_type='ACCOUNT_ACTIVA'`, [campusId, institutionId, until]);
    const demand = await client.query<{ views: string; requests: string }>(
      `SELECT count(*) FILTER (WHERE event_type='RESOURCE_VIEWED')::text AS views,
              count(*) FILTER (WHERE event_type='RESOURCE_REQUESTED')::text AS requests
       FROM public.evento_analitica
       WHERE campus_id=$1 AND institution_id=$2 AND occurred_at >= $3 AND occurred_at < $4
         AND event_type IN ('RESOURCE_VIEWED','RESOURCE_REQUESTED')`, [campusId, institutionId, from, until]);
    const subjects = await client.query<{ subjectId: string; subjectName: string | null; views: string; requests: string }>(
      `SELECT s.subject_id AS "subjectId", a.nombre AS "subjectName",
              count(*) FILTER (WHERE e.event_type='RESOURCE_VIEWED')::text AS views,
              count(*) FILTER (WHERE e.event_type='RESOURCE_REQUESTED')::text AS requests
       FROM public.evento_analitica e
       CROSS JOIN LATERAL (SELECT DISTINCT unnest(e.subject_ids) AS subject_id) s
       LEFT JOIN public.asignatura a ON a.id=s.subject_id
       WHERE e.campus_id=$1 AND e.institution_id=$2 AND e.occurred_at >= $3 AND e.occurred_at < $4
         AND e.event_type IN ('RESOURCE_VIEWED','RESOURCE_REQUESTED')
       GROUP BY s.subject_id,a.nombre ORDER BY a.nombre NULLS LAST,s.subject_id`, [campusId, institutionId, from, until]);
    return { scope, activeUsers: Number(active.rows[0].count),
      resourceDemand: { views: Number(demand.rows[0].views), requests: Number(demand.rows[0].requests) },
      subjectDemand: subjects.rows.map(row => ({ subjectId: row.subjectId,
        subjectName: row.subjectName ?? row.subjectId, views: Number(row.views), requests: Number(row.requests) })) };
}
