import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { ApiError } from '../../services/apiError.js';
import type { PoolClient } from 'pg';
import type { ActivityReportReceipt, ContentReportReceipt, NewActivityReport, NewContentReport } from './reports.types.js';
import { lockAccountContext } from '../auth/auth.repository.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';

export function probeReportsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"reporte_contenido"}]),
  });
}

/** Persistencia común de denuncias; la autorización y el contexto se resuelven antes del INSERT. */
export async function insertContentReport(client:PoolClient,report:NewContentReport):Promise<ContentReportReceipt> {
  const result=await client.query<{id:string;reportado_en:Date|string}>(`INSERT INTO public.reporte_contenido
    (reportante_id,campus_id,entidad_tipo,entidad_id,motivo,descripcion,contenido_reportado_json,estado_reporte)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'PENDIENTE') RETURNING id,reportado_en`,
    [report.userId,report.campusId,report.entityType,report.entityId,report.reason,report.description??null,JSON.stringify(report.snapshot)]);
  const row=result.rows[0];
  return {id:row.id,campusId:report.campusId,status:'PENDIENTE',reportedAt:new Date(row.reportado_en).toISOString()};
}

export async function saveActivityReport(report: NewActivityReport, auth: VerifiedAuthConnection,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt> {
  try {
    return await transaction(async client => {
      // Reutiliza el bloqueo que serializa cambios de cuenta, campus y concesiones de roles.
      const { profile, roles } = await lockAccountContext(client, auth.userId);
      if (!profile || report.userId !== auth.userId || report.campusId !== auth.campusId
        || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) {
        throw new ApiError(403, 'FORBIDDEN', 'Tu cuenta o campus cambió. Actualiza la sesión.');
      }
      requireCampusCapability({ ...auth, profile, roles }, report.campusId, 'general');
      return {...await insertContentReport(client,{...report,entityType:'ACTIVIDAD',entityId:report.activityId}),activityId:report.activityId};
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar el envío de la denuncia.');
  }
}
