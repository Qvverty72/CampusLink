import { createModuleHealthCheck } from '../../../shared/health/module-health.js';
import { findOwnActivityReport, probeReportsDependencies, saveActivityReport } from '../repositories/reports.repository.js';
import type { ReportsHealth } from '../types/reports.types.js';
import type { ActivityReportReceipt, ActivityReportSnapshot, NewActivityReport, ReportActivityInput, ReportsDependencies } from '../types/reports.types.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { getAuthorizedActiveMap } from '../../maps/public.js';
import { spatialBuildings } from '../../activities/domain/activities.location.js';
import { toVisibleActivity } from '../../activities/domain/activities.policy.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { parseActivityReport } from '../validators/reports.validation.js';
import { requireCampusCapability } from '../../auth/domain/auth.authorization.js';
import { validActivityCreators } from '../../activities/public.js';

export const getReportsHealth: () => Promise<ReportsHealth> =
  createModuleHealthCheck('reports', probeReportsDependencies);

/** Solo el usuario autenticado y su campus actual pueden recuperar su propio acuse. */
export async function getOwnActivityReport(auth: VerifiedAuthConnection, activityId: string,
  dependencies: ReportsDependencies = {}): Promise<ActivityReportReceipt | null> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'Identificador de actividad inválido.');
  requireCampusCapability(auth, auth.campusId, 'general');
  return dependencies.findOwnActivityReport
    ? dependencies.findOwnActivityReport(auth.userId, auth.campusId, activityId.toLowerCase())
    : findOwnActivityReport(auth, activityId.toLowerCase());
}

/**
 * Registra una denuncia de actividad visible en el mapa actual del usuario.
 * Guarda una instantánea pública para revisión posterior, sin datos de participación o eventos.
 */
export async function reportActivity(auth: VerifiedAuthConnection, activityId: string, input: ReportActivityInput,
  dependencies: ReportsDependencies = {}): Promise<ActivityReportReceipt> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'Identificador de actividad inválido.');
  const parsed = parseActivityReport(input);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los datos de la denuncia.', { details: parsed.issues });
  const id = activityId.toLowerCase();
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const now = dependencies.now?.() ?? new Date();
  const find = dependencies.findActivity ?? (await import('../../activities/public.js')).findVisibleActivity;
  const document = await find(auth.campusId, id, now);
  const visible = document && toVisibleActivity(document, auth.campusId, now, spatialBuildings(map));
  if (!visible || visible.id !== id) throw new ApiError(404, 'NOT_FOUND', 'Esta actividad ya no está disponible para denunciar.');
  const creators = await validActivityCreators(auth, [document.createdByUserId], dependencies);
  if (!creators.has(document.createdByUserId)) throw new ApiError(404, 'NOT_FOUND', 'Esta actividad ya no está disponible para denunciar.');
  // Conserva el contenido que vio quien denuncia; excluye participación, historial de cambios y avisos.
  const snapshot: ActivityReportSnapshot = { ...visible, visibility: 'PUBLIC', revision: document.editRevision ?? 0 };
  if (typeof document.createdByUserId === 'string' && /^[0-9a-f-]{36}$/i.test(document.createdByUserId)) snapshot.createdByUserId = document.createdByUserId;
  if (typeof document.bannerUrl === 'string') {
    try {
      const url = new URL(document.bannerUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) snapshot.bannerUrl = url.href;
    } catch { /* Los metadatos opcionales malformados no se incluyen en la denuncia. */ }
  }
  if (typeof document.category === 'string' && document.category.trim()) snapshot.category = document.category.trim();
  if (Array.isArray(document.tags)) snapshot.tags = document.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim());
  const save = dependencies.saveActivityReport ?? ((report: NewActivityReport) => saveActivityReport(report, auth));
  return save({ ...parsed.data as ReportActivityInput, activityId: id, campusId: auth.campusId, userId: auth.userId, snapshot });
}
