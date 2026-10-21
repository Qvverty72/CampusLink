import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { ApiError } from '../../services/apiError.js';
import type { PoolClient } from 'pg';
import type { ActivityReportReceipt, ContentReportReceipt, NewActivityReport, NewContentReport } from './reports.types.js';

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

async function requireReportProfile(client: PoolClient, userId: string, campusId: string, lock: 'SHARE' | 'UPDATE') {
  const profile = await client.query(`SELECT id FROM public.perfil_usuario WHERE id=$1 AND campus_id=$2
    AND estado_cuenta='ACTIVA' AND deleted_at IS NULL FOR ${lock}`, [userId, campusId]);
  if (profile.rows.length !== 1) throw new ApiError(403, 'FORBIDDEN', 'Tu cuenta o campus cambió. Actualiza la sesión.');
}

/** Acuse propio con su motivo/descripción; no expone snapshot, identidad ni notas administrativas. */
async function selectOwnActivityReport(client: PoolClient, userId: string, campusId: string, activityId: string): Promise<ActivityReportReceipt | null> {
  const result = await client.query<{ id: string; reportado_en: Date | string; estado_reporte: ActivityReportReceipt['status']; motivo: string; descripcion: string | null }>(
    `SELECT id,reportado_en,estado_reporte,motivo,descripcion FROM public.reporte_contenido
     WHERE reportante_id=$1 AND campus_id=$2 AND entidad_tipo='ACTIVIDAD' AND entidad_id=$3
     ORDER BY reportado_en,id LIMIT 1`, [userId, campusId, activityId]);
  const row = result.rows[0];
  return row ? { id: row.id, activityId, campusId, status: row.estado_reporte, reportedAt: new Date(row.reportado_en).toISOString(),
    reason: row.motivo, description: row.descripcion } : null;
}

export async function findOwnActivityReport(userId: string, campusId: string, activityId: string,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt | null> {
  return transaction(async client => {
    await requireReportProfile(client, userId, campusId, 'SHARE');
    return selectOwnActivityReport(client, userId, campusId, activityId);
  });
}

export async function saveActivityReport(report: NewActivityReport,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt> {
  return transaction(async client => {
    // Serializa los intentos del mismo usuario antes de consultar/insertar (READ COMMITTED).
    // Conserva duplicados históricos; nunca reemplaza motivo, fecha o snapshot del primer envío.
    await requireReportProfile(client, report.userId, report.campusId, 'UPDATE');
    const previous = await selectOwnActivityReport(client, report.userId, report.campusId, report.activityId);
    if (previous) return previous;
    return {...await insertContentReport(client,{...report,entityType:'ACTIVIDAD',entityId:report.activityId}),
      activityId:report.activityId, reason:report.reason, description:report.description??null};
  });
}
