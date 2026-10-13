import { parsePaginationQuery } from '../../services/pagination.js';
import type { ValidationResult } from '../../types/api.js';
import type { ReviewQuery, ReportStatus, ReviewTargetType } from './reports.review.types.js';

export const reviewStatuses = ['PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO'] as const;
export const reviewTargetTypes = ['PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'ACTIVIDAD', 'TRANSACCION', 'COMPORTAMIENTO'] as const;
export const reviewUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReviewParams(input: unknown): ValidationResult<{ campusId: string; reportId?: string }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, issues: [{ field: 'params', message: 'Identificador inválido.' }] };
  }
  const params = input as Record<string, unknown>;
  const issues = Object.keys(params).filter(key => !['campusId', 'reportId'].includes(key))
    .map(field => ({ field, message: 'Parámetro no admitido.' }));
  for (const field of ['campusId', ...(params.reportId !== undefined ? ['reportId'] : [])]) {
    if (typeof params[field] !== 'string' || !reviewUuid.test(params[field])) issues.push({ field, message: 'Identificador inválido.' });
  }
  return issues.length ? { success: false, issues } : { success: true, data: {
    campusId: (params.campusId as string).toLowerCase(),
    ...(params.reportId !== undefined ? { reportId: (params.reportId as string).toLowerCase() } : {}),
  } };
}

export function parseReviewQuery(input: unknown): ValidationResult<ReviewQuery> {
  const pagination = parsePaginationQuery(input);
  if (!pagination.success) return pagination;
  const query = input as Record<string, unknown>;
  const issues = Object.keys(query).filter(key => !['page', 'limit', 'status', 'targetType'].includes(key))
    .map(field => ({ field, message: 'Filtro no admitido.' }));
  if (query.status !== undefined && !reviewStatuses.includes(query.status as ReportStatus)) {
    issues.push({ field: 'status', message: 'Estado de denuncia inválido.' });
  }
  if (query.targetType !== undefined && !reviewTargetTypes.includes(query.targetType as ReviewTargetType)) {
    issues.push({ field: 'targetType', message: 'Tipo de contenido inválido.' });
  }
  return issues.length ? { success: false, issues } : { success: true, data: { ...pagination.data,
    ...(query.status !== undefined ? { status: query.status as ReportStatus } : {}),
    ...(query.targetType !== undefined ? { targetType: query.targetType as ReviewTargetType } : {}),
  } };
}
