import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import type { DependencyChecks } from '../../../shared/health/health.types.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import type { PoolClient } from 'pg';
import type { ActivityReportReceipt, ContentReportReceipt, PhysicalgoodsReportReceipt, NewActivityReport, NewContentReport } from '../types/reports.types.js';
import { lockAccountContext } from '../../auth/repositories/auth.repository.js';
import { requireCampusCapability } from '../../auth/domain/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';

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

/** Primer acuse propio de publicación, en cualquier estado; nunca expone evidencia ni notas de moderación. */
export async function selectOwnPublicationReport(client:PoolClient,userId:string,campusId:string,entityType:'PUBLICACION_FISICA'|'PUBLICACION_DIGITAL',publicationId:string):Promise<PhysicalgoodsReportReceipt|null>{
  const row=(await client.query<{id:string;reportado_en:Date|string;estado_reporte:ContentReportReceipt['status'];motivo:string;descripcion:string|null}>(
    `SELECT id,reportado_en,estado_reporte,motivo,descripcion FROM public.reporte_contenido
      WHERE reportante_id=$1 AND campus_id=$2 AND entidad_tipo=$3 AND entidad_id=$4 ORDER BY reportado_en,id LIMIT 1`,[userId,campusId,entityType,publicationId])).rows[0];
  return row?{id:row.id,campusId,publicationId,transactionId:null,status:row.estado_reporte,reportedAt:new Date(row.reportado_en).toISOString(),reason:row.motivo,description:row.descripcion}:null;
}

/** Revalida cuenta, institución y roles persistidos antes de leer o guardar un acuse. */
async function requireActivityReportContext(client: PoolClient, auth: VerifiedAuthConnection) {
  // FOR NO KEY UPDATE del helper existente serializa también envíos del mismo usuario.
  const { profile, roles } = await lockAccountContext(client, auth.userId);
  if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Tu cuenta o campus cambió. Actualiza la sesión.');
  }
  requireCampusCapability({ ...auth, profile, roles }, auth.campusId, 'general');
}

/** Solo datos del primer envío propio; excluye snapshot, identidad y notas administrativas. */
async function selectOwnActivityReport(client: PoolClient, userId: string, campusId: string, activityId: string): Promise<ActivityReportReceipt | null> {
  const result = await client.query<{ id: string; reportado_en: Date | string; estado_reporte: ActivityReportReceipt['status']; motivo: string; descripcion: string | null }>(
    `SELECT id,reportado_en,estado_reporte,motivo,descripcion FROM public.reporte_contenido
     WHERE reportante_id=$1 AND campus_id=$2 AND entidad_tipo='ACTIVIDAD' AND entidad_id=$3
     ORDER BY reportado_en,id LIMIT 1`, [userId, campusId, activityId]);
  const row = result.rows[0];
  return row ? { id: row.id, activityId, campusId, status: row.estado_reporte, reportedAt: new Date(row.reportado_en).toISOString(),
    reason: row.motivo, description: row.descripcion } : null;
}

export async function findOwnActivityReport(auth: VerifiedAuthConnection, activityId: string,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt | null> {
  try {
    return await transaction(async client => {
      await requireActivityReportContext(client, auth);
      return selectOwnActivityReport(client, auth.userId, auth.campusId, activityId);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar la denuncia.');
  }
}

export async function saveActivityReport(report: NewActivityReport, auth: VerifiedAuthConnection,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt> {
  try {
    return await transaction(async client => {
      if (report.userId !== auth.userId || report.campusId !== auth.campusId) {
        throw new ApiError(403, 'FORBIDDEN', 'Tu cuenta o campus cambió. Actualiza la sesión.');
      }
      await requireActivityReportContext(client, auth);
      // El SELECT posterior al bloqueo ve el envío confirmado por cualquier intento anterior.
      // Se conservan duplicados históricos y nunca se reemplazan sus datos originales.
      const previous = await selectOwnActivityReport(client, report.userId, report.campusId, report.activityId);
      if (previous) return previous;
      return { ...await insertContentReport(client, { ...report, entityType: 'ACTIVIDAD', entityId: report.activityId }),
        activityId: report.activityId, reason: report.reason, description: report.description ?? null };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar el envío de la denuncia.');
  }
}
