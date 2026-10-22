import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import { probeMongoCollections } from '../../database/mongodb/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { PoolClient } from 'pg';
import type { DashboardOptions, DashboardScope, ResourceAnalyticsEvent, SubjectDemand } from './analytics.types.js';

export function probeAnalyticsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"interaccion_recurso"},{"table":"solicitud_recurso"},{"table":"transaccion_recurso"},{"table":"confirmacion_transaccion"},{"table":"auditoria"}]),
    mongodb: () => probeMongoCollections(["activities","activity_interactions"]),
  });
}

export async function findAnalyticsResource(client: PoolClient, id: string, campusId: string, institutionId: string) {
  return (await client.query<{id: string; campus_id: string}>(`SELECT p.id,p.campus_id
    FROM public.publicacion_recurso p JOIN public.campus c ON c.id=p.campus_id
    JOIN public.campus current_campus ON current_campus.id=$2 AND current_campus.institucion_id=$3 AND current_campus.activo
    WHERE p.id=$1 AND p.deleted_at IS NULL AND c.institucion_id=$3
      AND ((p.tipo_recurso='FISICO' AND p.campus_id=$2 AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO','FINALIZADO')
        AND EXISTS(SELECT 1 FROM public.recurso_fisico f WHERE f.publicacion_id=p.id))
      OR (p.tipo_recurso='DIGITAL' AND p.estado_publicacion='DISPONIBLE'
        AND EXISTS(SELECT 1 FROM public.recurso_digital d WHERE d.publicacion_id=p.id)
        AND EXISTS(SELECT 1 FROM public.archivo_publicacion a WHERE a.publicacion_id=p.id AND a.tipo_archivo='RECURSO' AND a.deleted_at IS NULL)))
    FOR SHARE OF p`, [id,campusId,institutionId])).rows[0] ?? null;
}

export async function insertResourceView(client: PoolClient, id: string, userId: string, publicationId: string) {
  await client.query(`INSERT INTO public.interaccion_recurso(id,perfil_usuario_id,publicacion_id,tipo_interaccion,created_at)
    VALUES($1,$2,$3,'VISTA',clock_timestamp()) ON CONFLICT(id) DO NOTHING`, [id,userId,publicationId]);
  return (await client.query<{publicacion_id:string;perfil_usuario_id:string;tipo_interaccion:string}>(
    'SELECT publicacion_id,perfil_usuario_id,tipo_interaccion FROM public.interaccion_recurso WHERE id=$1',[id])).rows[0];
}

export async function findResourceRequestOperation(client: PoolClient, id: string) {
  return (await client.query<{id:string;publicacion_id:string;solicitante_id:string;codigo_mensaje:string;estado_solicitud:'PENDIENTE'|'ACEPTADA'|'RECHAZADA'|'CANCELADA';solicitada_en:string}>(
    `SELECT id,publicacion_id,solicitante_id,codigo_mensaje,estado_solicitud,
      to_char(solicitada_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS solicitada_en
    FROM public.solicitud_recurso WHERE id=$1`, [id])).rows[0] ?? null;
}

/** Proyección interna sobre hechos persistidos. El consumidor debe autorizar campus/período antes de llamarla. */
export async function readResourceAnalyticsEvents(client: PoolClient, campusId: string, from: string, until: string): Promise<ResourceAnalyticsEvent[]> {
  return (await client.query<ResourceAnalyticsEvent>(`WITH events AS (
    SELECT 'view:'||v.id AS key,'VISTA' AS type,p.campus_id,p.id AS publication_id,v.perfil_usuario_id AS user_id,
      NULL::uuid AS request_id,NULL::uuid AS transaction_id,v.created_at AS occurred_at
    FROM public.interaccion_recurso v JOIN public.publicacion_recurso p ON p.id=v.publicacion_id
    WHERE p.campus_id=$1 AND v.tipo_interaccion='VISTA' AND v.created_at >= $2::timestamptz AND v.created_at < $3::timestamptz
    UNION ALL
    SELECT 'request:'||r.id,'SOLICITUD_CREADA',p.campus_id,p.id,r.solicitante_id,r.id,NULL::uuid,r.solicitada_en
    FROM public.solicitud_recurso r JOIN public.publicacion_recurso p ON p.id=r.publicacion_id
    WHERE p.campus_id=$1 AND r.solicitada_en >= $2::timestamptz AND r.solicitada_en < $3::timestamptz
    UNION ALL
    SELECT 'transaction:'||t.id||':'||e.type,e.type,p.campus_id,p.id,e.user_id,t.solicitud_id,t.id,e.occurred_at
    FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
    LEFT JOIN LATERAL (SELECT usuario_id,confirmado_en FROM public.confirmacion_transaccion
      WHERE transaccion_id=t.id ORDER BY confirmado_en,id LIMIT 1) first_confirmation ON true
    LEFT JOIN LATERAL (SELECT usuario_id FROM public.confirmacion_transaccion
      WHERE transaccion_id=t.id ORDER BY confirmado_en DESC,id DESC LIMIT 1) last_confirmation ON true
    CROSS JOIN LATERAL (VALUES
      ('TRANSACCION_RESERVADA',t.iniciada_en,t.propietario_id),
      ('TRANSACCION_PENDIENTE_CONFIRMACION',first_confirmation.confirmado_en,first_confirmation.usuario_id),
      ('TRANSACCION_COMPLETADA',t.completada_en,last_confirmation.usuario_id),
      ('TRANSACCION_CANCELADA',t.cancelada_en,t.cancelada_por_id)
    ) e(type,occurred_at,user_id)
    WHERE p.campus_id=$1 AND e.occurred_at >= $2::timestamptz AND e.occurred_at < $3::timestamptz
  ) SELECT key,type,campus_id AS "campusId",publication_id AS "publicationId",user_id AS "userId",
    request_id AS "requestId",transaction_id AS "transactionId",
    to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
    FROM events ORDER BY occurred_at,key`, [campusId,from,until])).rows;
}

/** Incluye cambios anteriores/posteriores al corte; no filtra por estado ni baja actuales del perfil. */
export async function readAccountStateAnalyticsEvents(client: PoolClient, campusId: string) {
  return (await client.query<{key:string;campusId:string;userId:string;actorId:string|null;before:string;after:string;occurredAt:string}>(
    `SELECT id AS key,campus_id AS "campusId",entidad_id AS "userId",actor_usuario_id AS "actorId",
      datos_antes->>'estado_cuenta' AS before,datos_despues->>'estado_cuenta' AS after,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "occurredAt"
    FROM public.auditoria WHERE campus_id=$1 AND entidad_tipo='perfil_usuario'
      AND accion IN ('SUSPENDER_CUENTA','DESACTIVAR_CUENTA','REACTIVAR_CUENTA') ORDER BY created_at,id`, [campusId])).rows;
}

/**
 * Cuenta eventos ocurridos en `[from, until)` para un campus.
 * Usa el registro histórico de interacciones, no el estado JOINED actual como métrica pasada.
 */
export async function countActivityInteractions(campusId: string | string[], from: Date, until: Date, userIds?: string[]) {
  const campusIds = typeof campusId === 'string' ? [campusId] : campusId;
  if (!campusIds.length || campusIds.some(id => !id) || !Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime()) || until <= from) throw new Error('Invalid metric scope.');
  const { getMongoDb } = await import('../../config/mongodb.js');
  const counts = await getMongoDb().collection('activity_interactions').aggregate<{ _id: string; count: number; legacy: number }>([
    { $match: { campusId: typeof campusId === 'string' ? campusId : { $in: campusIds }, ...(userIds ? { userId: { $in: userIds } } : {}),
      occurredAt: { $gte: from, $lt: until }, type: { $in: ['VIEWED', 'JOINED', 'LEFT'] } } },
    { $group: { _id: '$type', count: { $sum: 1 }, legacy: { $sum: { $cond: [{ $eq: ['$provenance', 'LEGACY_STATE'] }, 1, 0] } } } },
  ]).toArray();
  return { viewed: counts.find(row => row._id === 'VIEWED')?.count ?? 0,
    joined: counts.find(row => row._id === 'JOINED')?.count ?? 0, left: counts.find(row => row._id === 'LEFT')?.count ?? 0,
    legacyEvents: counts.reduce((total, row) => total + row.legacy, 0) };
}

/** Solo catálogos de sedes previamente autorizadas, dentro de la institución del perfil. */
export async function readDashboardOptions(client: PoolClient, campusIds: string[], institutionId: string): Promise<DashboardOptions> {
  const campuses = (await client.query<{ id: string; name: string; institutionName: string }>(
    `SELECT c.id, c.nombre AS name, i.nombre AS "institutionName"
     FROM public.campus c JOIN public.institucion i ON i.id=c.institucion_id
     WHERE c.id=ANY($1::uuid[]) AND i.id=$2 AND c.activo ORDER BY c.nombre,c.id`, [campusIds, institutionId])).rows;
  if (!campuses.length) return { institutions: [] };
  const careers = (await client.query<{ id: string; name: string; campusIds: string[] }>(
    `WITH relations AS (
       SELECT carrera_id,campus_id FROM public.campus_carrera WHERE campus_id=ANY($1::uuid[])
       UNION
       SELECT pc.carrera_id,p.campus_id FROM public.publicacion_carrera pc
       JOIN public.publicacion_recurso p ON p.id=pc.publicacion_id WHERE p.campus_id=ANY($1::uuid[])
       UNION
       SELECT uc.carrera_id,p.campus_id FROM public.usuario_carrera uc
       JOIN public.perfil_usuario p ON p.id=uc.perfil_usuario_id
       WHERE p.campus_id=ANY($1::uuid[]) AND p.institucion_id=$2
     ) SELECT r.id,r.nombre AS name,array_agg(cc.campus_id ORDER BY cc.campus_id) AS "campusIds"
     FROM public.carrera r JOIN relations cc ON cc.carrera_id=r.id
     WHERE r.institucion_id=$2
     GROUP BY r.id,r.nombre ORDER BY r.nombre,r.id`, [campuses.map(c => c.id), institutionId])).rows;
  return { institutions: [{ id: institutionId, name: campuses[0].institutionName,
    campuses: campuses.map(({ id, name }) => ({ id, name })), careers }] };
}

/** Agrega hechos existentes; no excluye contenido retirado ni actores desactivados. */
export async function readDashboardMetrics(client: PoolClient, campusId: string | string[], institutionId: string, from: Date, until: Date, careerId: string | null = null) {
  const campusIds = [...new Set(typeof campusId === 'string' ? [campusId] : campusId)];
  const institution = (await readDashboardOptions(client, campusIds, institutionId)).institutions[0];
  if (!institution || institution.campuses.length !== campusIds.length) return null;
  const career = careerId ? institution.careers.find(row => row.id === careerId) : null;
  if (careerId && !career) return null;
  const scope: DashboardScope = { institutionId, institutionName: institution.name,
    campusId: campusIds.length === 1 ? campusIds[0] : null,
    campusName: institution.campuses.map(c => c.name).join(', '), campuses: institution.campuses,
    career: career ? { id: career.id, name: career.name } : null };
  const careerUserIds = careerId ? (await client.query<{ id: string }>(
    `SELECT p.id FROM public.perfil_usuario p WHERE p.institucion_id=$1
       AND EXISTS(SELECT 1 FROM public.usuario_carrera uc WHERE uc.perfil_usuario_id=p.id AND uc.carrera_id=$2)`,
    [institutionId, careerId])).rows.map(row => row.id) : undefined;

  // El estado es global: una transición posterior en otro campus también permite deshacer el presente.
  // Conserva la precisión SQL y el corte exclusivo; no cuenta cuentas creadas después del corte.
  const active = await client.query<{ count: string }>(
    `WITH changes AS (
       SELECT entidad_id, datos_antes->>'estado_cuenta' AS before, datos_despues->>'estado_cuenta' AS after, created_at, id
       FROM public.auditoria WHERE institucion_id=$2 AND entidad_tipo='perfil_usuario'
         AND accion IN ('SUSPENDER_CUENTA','DESACTIVAR_CUENTA','REACTIVAR_CUENTA')
     ), previous AS (
       SELECT DISTINCT ON (entidad_id) entidad_id, after FROM changes WHERE created_at<$3::timestamptz
       ORDER BY entidad_id,created_at DESC,id DESC
     ), following AS (
       SELECT DISTINCT ON (entidad_id) entidad_id, before FROM changes WHERE created_at>=$3::timestamptz
       ORDER BY entidad_id,created_at,id
     )
     SELECT count(*)::text AS count FROM public.perfil_usuario p
     LEFT JOIN following f ON f.entidad_id=p.id::text LEFT JOIN previous v ON v.entidad_id=p.id::text
     WHERE p.campus_id=ANY($1::uuid[]) AND p.institucion_id=$2 AND p.created_at<$3::timestamptz
       AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM public.usuario_carrera uc WHERE uc.perfil_usuario_id=p.id AND uc.carrera_id=$4))
       AND (p.deleted_at IS NULL OR p.deleted_at>=$3::timestamptz)
       AND coalesce(f.before,v.after,p.estado_cuenta)='ACTIVA'`, [campusIds, institutionId, until, careerId]);

  // Primero agrupa por publicación; asociar varias asignaturas no multiplica el total de recursos.
  const demand = (await client.query<{ views: string; requests: string; subjects: SubjectDemand[] }>(
    `WITH eligible AS (
       SELECT p.id,p.campus_id FROM public.publicacion_recurso p
       WHERE p.campus_id=ANY($1::uuid[]) AND ($4::uuid IS NULL OR
         EXISTS(SELECT 1 FROM public.publicacion_carrera pc WHERE pc.publicacion_id=p.id AND pc.carrera_id=$4))
     ), facts AS (
       SELECT p.id, count(*) AS views, 0::bigint AS requests
       FROM public.interaccion_recurso v JOIN eligible p ON p.id=v.publicacion_id
       WHERE v.tipo_interaccion='VISTA' AND v.created_at>=$2::timestamptz AND v.created_at<$3::timestamptz
       GROUP BY p.id
       UNION ALL
       SELECT p.id, 0::bigint, count(*) FROM public.solicitud_recurso r
       JOIN eligible p ON p.id=r.publicacion_id
       WHERE r.solicitada_en>=$2::timestamptz AND r.solicitada_en<$3::timestamptz
       GROUP BY p.id
     ), publications AS (
       SELECT id, sum(views) AS views, sum(requests) AS requests FROM facts GROUP BY id
     ), subjects AS (
       SELECT a.id AS "subjectId", a.nombre AS "subjectName", sum(p.views) AS views, sum(p.requests) AS requests
       FROM publications p JOIN public.publicacion_asignatura pa ON pa.publicacion_id=p.id
       JOIN public.asignatura a ON a.id=pa.asignatura_id
       GROUP BY a.id,a.nombre
     )
     SELECT coalesce(sum(views),0)::text AS views, coalesce(sum(requests),0)::text AS requests,
       (SELECT coalesce(jsonb_agg(s ORDER BY s."subjectName",s."subjectId"),'[]'::jsonb) FROM subjects s) AS subjects
     FROM publications`, [campusIds, from, until, careerId])).rows[0];
  return { scope, careerUserIds, activeUsers: Number(active.rows[0].count),
    resourceDemand: { views: Number(demand.views), requests: Number(demand.requests) }, subjectDemand: demand.subjects };
}
