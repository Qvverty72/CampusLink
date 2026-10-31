import type { PoolClient } from 'pg';
import type { AnalyticalReport, DashboardQuery, HistoricalReportsQuery, HistoricalReportSummary } from '../types/analytics.types.js';
import type { AuthAssignment } from '../../auth/types/auth.types.js';


/** Relectura al guardar: el cálculo puede haber terminado después de una revocación. */
export async function readAnalyticsPermissions(client: PoolClient, userId: string): Promise<AuthAssignment[]> {
  return (await client.query<AuthAssignment>(
    `SELECT p.id,p.nombre AS name,up.campus_id AS "campusId" FROM public.usuario_permiso up
     JOIN public.permiso p ON p.id=up.permiso_id WHERE up.perfil_usuario_id=$1 AND up.revocado_en IS NULL
     ORDER BY up.id FOR SHARE OF up,p`, [userId])).rows;
}


/** Correo del autor al generar; las lecturas históricas no consultan su cuenta actual. */
export async function readReportAuthorEmail(client: PoolClient, userId: string): Promise<string | null> {
  const email = (await client.query<{ email: string | null }>('SELECT email FROM auth.users WHERE id=$1', [userId])).rows[0]?.email;
  return email?.trim() || null;
}


/** Inserción única: sin upsert ni escritura de resultados existentes. */
export async function insertAnalyticalReport(client: PoolClient, report: AnalyticalReport, filters: DashboardQuery, from: Date, until: Date) {
  await client.query(
    `INSERT INTO public.reporte(id,generado_por_id,institucion_id,campus_id,carrera_id,tipo_reporte,
       periodo_desde,periodo_hasta,agrupacion,filtros_json,snapshot_json,generado_en)
     VALUES($1,$2,$3,$4,$5,'KPI_ESENCIALES',$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
    [report.id, report.generatedBy.userId, filters.institutionId, report.scope.campusId, filters.careerId,
      from, until, filters.grouping === 'week' ? 'SEMANA' : 'MES', JSON.stringify(filters), JSON.stringify(report), report.generatedAt]);
}


/** Lectura histórica sin joins a recursos, carreras o perfiles del responsable. */
export async function findAnalyticalReport(client: PoolClient, id: string, institutionId: string): Promise<AnalyticalReport | null> {
  return (await client.query<{ snapshot_json: AnalyticalReport }>(
    `SELECT snapshot_json FROM public.reporte WHERE id=$1 AND institucion_id=$2 AND tipo_reporte='KPI_ESENCIALES'`,
    [id, institutionId])).rows[0]?.snapshot_json ?? null;
}


/** Filtra el ámbito completo antes de paginar; no consulta catálogos ni hechos operacionales. */
export async function readHistoricalReports(client: PoolClient, query: HistoricalReportsQuery, authorizedCampusIds: string[]): Promise<HistoricalReportSummary[]> {
  const result = await client.query<{ summary: HistoricalReportSummary }>(
    `SELECT jsonb_build_object('id',snapshot_json->'id','generatedAt',snapshot_json->'generatedAt',
       'generatedBy',snapshot_json->'generatedBy','scope',snapshot_json->'scope','period',snapshot_json->'period',
       'grouping',snapshot_json->'grouping','calculationVersion',snapshot_json->'calculationVersion') AS summary
     FROM public.reporte r WHERE institucion_id=$1 AND tipo_reporte='KPI_ESENCIALES'
       AND snapshot_json->'scope'->>'institutionId'=$1::text
       AND jsonb_array_length(snapshot_json->'scope'->'campuses')>0
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot_json->'scope'->'campuses') c
         WHERE NOT (c->>'id'=ANY($2::text[])))
       AND (cardinality($3::text[])=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot_json->'scope'->'campuses') c
         WHERE c->>'id'=ANY($3::text[])))
       AND ($4::text IS NULL OR snapshot_json->'scope'->'career'->>'id'=$4)
       AND ($5::text IS NULL OR snapshot_json->'period'->>'to'>=$5)
       AND ($6::text IS NULL OR snapshot_json->'period'->>'from'<=$6)
       AND ($7::text IS NULL OR snapshot_json->>'grouping'=$7)
       AND ($8::timestamptz IS NULL OR (generado_en,id)<($8::timestamptz,$9::uuid))
     ORDER BY generado_en DESC,id DESC LIMIT $10`,
    [query.institutionId, authorizedCampusIds, query.campusIds, query.careerId, query.from, query.to, query.grouping,
      query.cursor?.generatedAt ?? null, query.cursor?.id ?? null, query.limit + 1]);
  return result.rows.map(row => row.summary);
}
