import type { PoolClient } from 'pg';
import type { ReportReviewDetail } from '../types/reports.types.js';

export async function saveReportDecision(client: PoolClient, report: ReportReviewDetail, actorId: string,
  justification: string, measure: 'OCULTAR' | 'NINGUNA', status: 'EN_REVISION' | 'RESUELTO' | 'DESESTIMADO') {
  await client.query(`UPDATE public.reporte_contenido SET estado_reporte=$3,fundamento_resolucion=$4,
    medida_aplicada=$5,resuelto_por_id=$6,resuelto_en=clock_timestamp() WHERE id=$1 AND campus_id=$2`,
    [report.id, report.campusId, status, justification, measure, actorId]);
}

/** El vínculo transacción/publicación se obtiene de filas reales, no de un identificador cliente o del snapshot. */
export async function lockReportPublication(client: PoolClient, report: ReportReviewDetail) {
  return (await client.query<{ id: string; tipo_recurso: string; estado_publicacion: string; deleted_at: string | null }>(
    `SELECT p.id,p.tipo_recurso,p.estado_publicacion,p.deleted_at FROM public.publicacion_recurso p
     WHERE p.campus_id=$1 AND p.id = CASE WHEN $2='TRANSACCION' THEN
       (SELECT t.publicacion_id FROM public.transaccion_recurso t WHERE t.id=$3::uuid)
       ELSE $3::uuid END FOR UPDATE OF p`, [report.campusId, report.entityType, report.entityId])).rows[0] ?? null;
}

export async function hideReportPublication(client: PoolClient, publicationId: string) {
  await client.query(`UPDATE public.publicacion_recurso SET estado_publicacion='OCULTO',
    updated_at=GREATEST(clock_timestamp(),updated_at+interval '1 microsecond') WHERE id=$1`, [publicationId]);
}

export async function finishActivityReport(client: PoolClient, report: ReportReviewDetail) {
  await client.query(`UPDATE public.reporte_contenido SET estado_reporte='RESUELTO' WHERE id=$1 AND campus_id=$2`, [report.id, report.campusId]);
}

function resolutionSnapshot(report: ReportReviewDetail) {
  return { id: report.id, campus_id: report.campusId, entidad_tipo: report.entityType, entidad_id: report.entityId,
    reportante_id: report.reporter.id, motivo: report.reason, descripcion: report.description,
    estado_reporte: report.status, reportado_en: report.reportedAt,
    fundamento_resolucion: report.resolution?.justification ?? null, medida_aplicada: report.resolution?.measure ?? null,
    resuelto_por_id: report.resolution?.resolvedById ?? null, resuelto_en: report.resolution?.resolvedAt ?? null };
}

export async function auditReportResolution(client: PoolClient, institutionId: string,
  before: ReportReviewDetail, after: ReportReviewDetail, action: 'DESESTIMAR_DENUNCIA' | 'RESOLVER_DENUNCIA') {
  await client.query(`INSERT INTO public.auditoria(actor_usuario_id,institucion_id,campus_id,entidad_tipo,entidad_id,
    accion,justificacion_accion,reporte_contenido_id,datos_antes,datos_despues,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::timestamptz)`,
    [after.resolution!.resolvedById, institutionId, after.campusId, 'reporte_contenido', after.id,
      action, after.resolution!.justification,
      after.id, JSON.stringify(resolutionSnapshot(before)), JSON.stringify(resolutionSnapshot(after)), after.resolution!.resolvedAt]);
}
