import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeReportsDependencies } from './reports.repository.js';
import type { ReportsHealth } from './reports.types.js';
import type { ActivityReportReceipt, ActivityReportSnapshot, ReportActivityInput, ReportsDependencies } from './reports.types.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { getAuthorizedActiveMap } from '../maps/map.service.js';
import { spatialBuildings } from '../activities/activities.location.js';
import { toVisibleActivity } from '../activities/activities.policy.js';
import { ApiError } from '../../services/apiError.js';
import { parseActivityReport } from './reports.validation.js';

export const getReportsHealth: () => Promise<ReportsHealth> =
  createModuleHealthCheck('reports', probeReportsDependencies);

export async function reportActivity(auth: VerifiedAuthConnection, activityId: string, input: ReportActivityInput,
  dependencies: ReportsDependencies = {}): Promise<ActivityReportReceipt> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'Identificador de actividad inválido.');
  const parsed = parseActivityReport(input);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los datos de la denuncia.', { details: parsed.issues });
  const id = activityId.toLowerCase();
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const now = dependencies.now?.() ?? new Date();
  const find = dependencies.findActivity ?? (await import('../activities/activities.detail.repository.js')).findVisibleActivity;
  const document = await find(auth.campusId, id, now);
  const visible = document && toVisibleActivity(document, auth.campusId, now, spatialBuildings(map));
  if (!visible || visible.id !== id) throw new ApiError(404, 'NOT_FOUND', 'Esta actividad ya no está disponible para denunciar.');
  // Keep the content reviewed by the complainant, never participation, change logs or delivery events.
  const snapshot: ActivityReportSnapshot = { ...visible, visibility: 'PUBLIC', revision: document.editRevision ?? 0 };
  if (typeof document.createdByUserId === 'string' && /^[0-9a-f-]{36}$/i.test(document.createdByUserId)) snapshot.createdByUserId = document.createdByUserId;
  if (typeof document.bannerUrl === 'string') {
    try {
      const url = new URL(document.bannerUrl);
      if (url.protocol === 'https:' && !url.username && !url.password) snapshot.bannerUrl = url.href;
    } catch { /* Malformed optional metadata is not evidence to publish. */ }
  }
  if (typeof document.category === 'string' && document.category.trim()) snapshot.category = document.category.trim();
  if (Array.isArray(document.tags)) snapshot.tags = document.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim());
  const save = dependencies.saveActivityReport ?? (await import('./reports.repository.js')).saveActivityReport;
  return save({ ...parsed.data as ReportActivityInput, activityId: id, campusId: auth.campusId, userId: auth.userId, snapshot });
}
