import type { PoolClient } from 'pg';
import type { DashboardGrouping, DashboardOptions, DashboardScope, SubjectDemand } from '../types/analytics.types.js';
import type { AnalyticsWindow } from '../domain/analytics.periods.js';
import { ANALYTICS_TIME_ZONE } from '../domain/analytics.periods.js';


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
export async function readDashboardMetrics(client: PoolClient, campusId: string | string[], institutionId: string, from: Date, until: Date, careerId: string | null = null, windows?: AnalyticsWindow[], grouping: DashboardGrouping = 'month') {
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
  const ranges = JSON.stringify([{ key: 'total', from, until }, ...(windows ?? [])].map(window =>
    ({ key: window.key, start: window.from.toISOString(), cutoff: window.until.toISOString() })));

  // El estado es global: una transición posterior en otro campus también permite deshacer el presente.
  // Conserva la precisión SQL y el corte exclusivo; no cuenta cuentas creadas después del corte.
  const active = await client.query<{ key: string; count: string }>(
    `WITH ranges AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS r(key text,start timestamptz,cutoff timestamptz)), changes AS (
       SELECT entidad_id, datos_antes->>'estado_cuenta' AS before, datos_despues->>'estado_cuenta' AS after, created_at, id
       FROM public.auditoria WHERE institucion_id=$2 AND entidad_tipo='perfil_usuario'
         AND accion IN ('SUSPENDER_CUENTA','DESACTIVAR_CUENTA','REACTIVAR_CUENTA')
     ), previous AS (
       SELECT DISTINCT ON (r.key,entidad_id) r.key, entidad_id, after FROM changes CROSS JOIN ranges r WHERE created_at<r.cutoff
       ORDER BY r.key,entidad_id,created_at DESC,id DESC
     ), following AS (
       SELECT DISTINCT ON (r.key,entidad_id) r.key, entidad_id, before FROM changes CROSS JOIN ranges r WHERE created_at>=r.cutoff
       ORDER BY r.key,entidad_id,created_at,id
     )
     SELECT r.key, count(p.id)::text AS count FROM ranges r
     LEFT JOIN public.perfil_usuario p ON p.campus_id=ANY($1::uuid[]) AND p.institucion_id=$2 AND p.created_at<least(r.cutoff,$3::timestamptz)
       AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM public.usuario_carrera uc WHERE uc.perfil_usuario_id=p.id AND uc.carrera_id=$4))
       AND (p.deleted_at IS NULL OR p.deleted_at>=r.cutoff)
       AND coalesce((SELECT f.before FROM following f WHERE f.key=r.key AND f.entidad_id=p.id::text),
         (SELECT v.after FROM previous v WHERE v.key=r.key AND v.entidad_id=p.id::text),p.estado_cuenta)='ACTIVA'
     GROUP BY r.key`, [campusIds, institutionId, until, careerId, ranges]);

  // Primero agrupa por publicación; asociar varias asignaturas no multiplica el total de recursos.
  const demand = (await client.query<{ key: string; views: string; requests: string; subjects: SubjectDemand[] }>(
    `WITH ranges AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS r(key text,start timestamptz,cutoff timestamptz)), eligible AS (
       SELECT p.id,p.campus_id FROM public.publicacion_recurso p
       WHERE p.campus_id=ANY($1::uuid[]) AND ($4::uuid IS NULL OR
         EXISTS(SELECT 1 FROM public.publicacion_carrera pc WHERE pc.publicacion_id=p.id AND pc.carrera_id=$4))
     ), facts AS (
       SELECT r.key,p.id, count(*) AS views, 0::bigint AS requests
       FROM public.interaccion_recurso v JOIN eligible p ON p.id=v.publicacion_id
       JOIN ranges r ON v.created_at>=r.start AND v.created_at<r.cutoff
         AND (r.key='total' OR r.key=to_char(date_trunc($6::text,v.created_at AT TIME ZONE $7::text),'YYYY-MM-DD'))
       WHERE v.tipo_interaccion='VISTA' AND v.created_at>=$2::timestamptz AND v.created_at<$3::timestamptz
       GROUP BY r.key,p.id
       UNION ALL
       SELECT w.key,p.id, 0::bigint, count(*) FROM public.solicitud_recurso r
       JOIN eligible p ON p.id=r.publicacion_id JOIN ranges w ON r.solicitada_en>=w.start AND r.solicitada_en<w.cutoff
         AND (w.key='total' OR w.key=to_char(date_trunc($6::text,r.solicitada_en AT TIME ZONE $7::text),'YYYY-MM-DD'))
       WHERE r.solicitada_en>=$2::timestamptz AND r.solicitada_en<$3::timestamptz
       GROUP BY w.key,p.id
     ), publications AS (
       SELECT key,id, sum(views) AS views, sum(requests) AS requests FROM facts GROUP BY key,id
     ), subjects AS (
       SELECT p.key,a.id AS "subjectId", a.nombre AS "subjectName", sum(p.views) AS views, sum(p.requests) AS requests
       FROM publications p JOIN public.publicacion_asignatura pa ON pa.publicacion_id=p.id
       JOIN public.asignatura a ON a.id=pa.asignatura_id
       GROUP BY p.key,a.id,a.nombre
     )
     SELECT r.key,coalesce(sum(p.views),0)::text AS views, coalesce(sum(p.requests),0)::text AS requests,
       (SELECT coalesce(jsonb_agg(to_jsonb(s)-'key' ORDER BY s."subjectName",s."subjectId"),'[]'::jsonb)
        FROM subjects s WHERE s.key=r.key) AS subjects
     FROM ranges r LEFT JOIN publications p ON p.key=r.key GROUP BY r.key`, [campusIds, from, until, careerId, ranges, grouping, ANALYTICS_TIME_ZONE])).rows;
  const metrics = demand.map(row => ({ key: row.key, activeUsers: Number(active.rows.find(a => a.key === row.key)?.count ?? 0),
    resourceDemand: { views: Number(row.views), requests: Number(row.requests) }, subjectDemand: row.subjects }));
  return { scope, careerUserIds, ...metrics.find(row => row.key === 'total')!, intervals: metrics };
}
