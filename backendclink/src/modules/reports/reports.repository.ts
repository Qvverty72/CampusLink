import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { ApiError } from '../../services/apiError.js';
import type { ActivityReportReceipt, NewActivityReport, ContentReportReceipt, NewContentReport, ReportTargetType } from './reports.types.js';
import type { PoolClient } from 'pg';
import { parseContentReport } from './reports.validation.js';

interface PendingReport {
  targetType: ReportTargetType; targetId: string; campusId: string; userId: string;
  reason: string; description?: string; snapshot: object;
}

async function requireCurrentReportAccount(client: PoolClient, userId: string, campusId: string): Promise<void> {
  // Keep the current profile and its campus stable until the SQL insert commits.
  const profile = await client.query<{ verificado_en: Date | string | null }>(`
    SELECT p.verificado_en FROM public.perfil_usuario p JOIN public.campus c ON c.id=p.campus_id
    WHERE p.id=$1 AND p.campus_id=$2 AND p.estado_cuenta='ACTIVA' AND p.deleted_at IS NULL AND c.activo=true
    FOR SHARE OF p,c`, [userId, campusId]);
  if (profile.rows.length !== 1) throw new ApiError(403, 'FORBIDDEN', 'Tu cuenta o campus cambió. Actualiza la sesión.');
  if (profile.rows[0].verificado_en) return;
  const roles = await client.query(`SELECT ur.id FROM public.usuario_rol ur JOIN public.rol r ON r.id=ur.rol_id
    WHERE ur.perfil_usuario_id=$1 AND ur.campus_id=$2 AND ur.revocado_en IS NULL
      AND r.nombre IN ('USUARIO_AUTORIZADO','ADMINISTRADOR') FOR SHARE OF ur,r`, [userId, campusId]);
  if (!roles.rows.length) throw new ApiError(403, 'FORBIDDEN', 'Ya no tienes autorización en este campus.');
}

/** One insert contract for every domain; evidence is never returned in the receipt. */
async function insertPendingReport(client: PoolClient, report: PendingReport): Promise<ContentReportReceipt> {
  const result = await client.query<{ id: string; reportado_en: Date | string }>(`
    INSERT INTO public.reporte_contenido
      (reportante_id,campus_id,entidad_tipo,entidad_id,motivo,descripcion,contenido_reportado_json,estado_reporte)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'PENDIENTE') RETURNING id,reportado_en`,
  [report.userId, report.campusId, report.targetType, report.targetId, report.reason,
    report.description ?? null, JSON.stringify(report.snapshot)]);
  const row = result.rows[0];
  if (!row) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar la denuncia.');
  return { id: row.id, targetType: report.targetType, targetId: report.targetId, campusId: report.campusId,
    status: 'PENDIENTE', reportedAt: new Date(row.reportado_en).toISOString() };
}

interface PublicationEvidence {
  id: string; campus_id: string; propietario_id: string; tipo_recurso: 'FISICO' | 'DIGITAL';
  titulo: string; descripcion: string | null; modalidad: string; precio: string | number | null;
  moneda: string; estado_publicacion: string; publicado_en: Date | string;
  updated_at: Date | string; deleted_at: Date | string | null;
}

function publicationSnapshot(row: PublicationEvidence) {
  return { id: row.id, campusId: row.campus_id, ownerId: row.propietario_id, resourceType: row.tipo_recurso,
    title: row.titulo, description: row.descripcion, modality: row.modalidad, price: row.precio, currency: row.moneda,
    status: row.estado_publicacion, publishedAt: new Date(row.publicado_en).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(), deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null };
}

async function publicationEvidence(client: PoolClient, report: NewContentReport): Promise<{ campusId: string; snapshot: object }> {
  const physical = report.targetType === 'PUBLICACION_FISICA';
  // Table/column fragments are constants selected by validated type, never client text.
  const result = await client.query<PublicationEvidence & { categoria_id?: string; estado_uso?: string }>(`
    SELECT p.id,p.campus_id,p.propietario_id,p.tipo_recurso,p.titulo,p.descripcion,p.modalidad,p.precio,p.moneda,
      p.estado_publicacion,p.publicado_en,p.updated_at,p.deleted_at${physical ? ',r.categoria_id,r.estado_uso' : ''}
    FROM public.publicacion_recurso p
    JOIN public.${physical ? 'recurso_fisico' : 'recurso_digital'} r ON r.publicacion_id=p.id
    WHERE p.id=$1 AND p.campus_id=$2 AND p.tipo_recurso=$3 AND p.deleted_at IS NULL
      AND p.estado_publicacion IN ('DISPONIBLE','RESERVADO','FINALIZADO') FOR SHARE OF p,r`,
  [report.targetId, report.accountCampusId, physical ? 'FISICO' : 'DIGITAL']);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Esta publicación no está disponible para denunciar.');
  return { campusId: row.campus_id, snapshot: { ...publicationSnapshot(row),
    ...(physical ? { categoryId: row.categoria_id, condition: row.estado_uso } : {}) } };
}

interface TransactionEvidence {
  id: string; solicitud_id: string; publicacion_id: string; propietario_id: string; receptor_id: string;
  estado_transaccion: string; modalidad_acordada: string; monto_acordado: string | number | null; moneda: string;
  iniciada_en: Date | string; completada_en: Date | string | null; cancelada_en: Date | string | null;
  cancelada_por_id: string | null; motivo_cancelacion: string | null; detalle_cancelacion: string | null;
  publication: PublicationEvidence;
}

async function transactionEvidence(client: PoolClient, report: NewContentReport): Promise<{ campusId: string; snapshot: object }> {
  const result = await client.query<TransactionEvidence>(`
    SELECT t.id,t.solicitud_id,t.publicacion_id,t.propietario_id,t.receptor_id,t.estado_transaccion,
      t.modalidad_acordada,t.monto_acordado,t.moneda,t.iniciada_en,t.completada_en,t.cancelada_en,
      t.cancelada_por_id,t.motivo_cancelacion,t.detalle_cancelacion,
      json_build_object('id',p.id,'campus_id',p.campus_id,'propietario_id',p.propietario_id,'tipo_recurso',p.tipo_recurso,
        'titulo',p.titulo,'descripcion',p.descripcion,'modalidad',p.modalidad,'precio',p.precio::text,'moneda',p.moneda,
        'estado_publicacion',p.estado_publicacion,'publicado_en',p.publicado_en,'updated_at',p.updated_at,'deleted_at',p.deleted_at) AS publication
    FROM public.transaccion_recurso t JOIN public.publicacion_recurso p ON p.id=t.publicacion_id
    WHERE t.id=$1 AND (t.propietario_id=$2 OR t.receptor_id=$2) FOR SHARE OF t,p`, [report.targetId, report.userId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Esta transacción no está disponible para denunciar.');
  // Own historical exchanges keep their original campus, including a hidden/deleted publication.
  // No storage paths, download URLs or unrelated transactions enter this evidence.
  return { campusId: row.publication.campus_id, snapshot: {
    id: row.id, requestId: row.solicitud_id, publicationId: row.publicacion_id,
    ownerId: row.propietario_id, recipientId: row.receptor_id, status: row.estado_transaccion,
    modality: row.modalidad_acordada, amount: row.monto_acordado, currency: row.moneda,
    startedAt: new Date(row.iniciada_en).toISOString(),
    completedAt: row.completada_en ? new Date(row.completada_en).toISOString() : null,
    cancelledAt: row.cancelada_en ? new Date(row.cancelada_en).toISOString() : null,
    cancelledById: row.cancelada_por_id, cancellationReason: row.motivo_cancelacion, cancellationDetail: row.detalle_cancelacion,
    publication: publicationSnapshot(row.publication),
  } };
}

export async function saveContentReport(report: NewContentReport,
  transaction = withPostgresTransaction): Promise<ContentReportReceipt> {
  const parsed = parseContentReport({ targetType: report.targetType, targetId: report.targetId,
    reason: report.reason, ...(report.description !== undefined ? { description: report.description } : {}) });
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los datos de la denuncia.', { details: parsed.issues });
  if (parsed.data.targetType === 'ACTIVIDAD') throw new ApiError(400, 'VALIDATION_ERROR', 'La actividad requiere comprobar su visibilidad.');
  const normalized = { ...report, ...parsed.data };
  try {
    return await transaction(async client => {
      await requireCurrentReportAccount(client, report.userId, report.accountCampusId);
      const evidence = normalized.targetType === 'TRANSACCION' ? await transactionEvidence(client, normalized)
        : await publicationEvidence(client, normalized);
      return insertPendingReport(client, { ...normalized, ...evidence });
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar el envío de la denuncia.');
  }
}

export function probeReportsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"reporte_contenido"}]),
  });
}

export async function saveActivityReport(report: NewActivityReport,
  transaction = withPostgresTransaction): Promise<ActivityReportReceipt> {
  return transaction(async client => {
    await requireCurrentReportAccount(client, report.userId, report.campusId);
    const { targetId, targetType: _type, ...receipt } = await insertPendingReport(client, {
      ...report, targetType: 'ACTIVIDAD', targetId: report.activityId,
    });
    return { ...receipt, activityId: targetId };
  });
}
