import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { ApiError } from '../../services/apiError.js';
import type { ActivityReportReceipt, NewActivityReport } from './reports.types.js';

export function probeReportsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"reporte_contenido"}]),
  });
}

export async function saveActivityReport(report: NewActivityReport,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt> {
  return transaction(async client => {
    // A concurrent campus move or suspension must not turn stale identity into a new report.
    const profile = await client.query(`SELECT id FROM public.perfil_usuario WHERE id=$1 AND campus_id=$2
      AND estado_cuenta='ACTIVA' AND deleted_at IS NULL FOR SHARE`, [report.userId, report.campusId]);
    if (profile.rows.length !== 1) throw new ApiError(403, 'FORBIDDEN', 'Tu cuenta o campus cambió. Actualiza la sesión.');
    const result = await client.query<{ id: string; reportado_en: Date | string }>(`
      INSERT INTO public.reporte_contenido
        (reportante_id,campus_id,entidad_tipo,entidad_id,motivo,descripcion,contenido_reportado_json,estado_reporte)
      VALUES ($1,$2,'ACTIVIDAD',$3,$4,$5,$6::jsonb,'PENDIENTE') RETURNING id,reportado_en`,
    [report.userId, report.campusId, report.activityId, report.reason, report.description ?? null, JSON.stringify(report.snapshot)]);
    const row = result.rows[0];
    return { id: row.id, activityId: report.activityId, campusId: report.campusId, status: 'PENDIENTE',
      reportedAt: new Date(row.reportado_en).toISOString() };
  });
}
