import type { ApiErrorDetail, ValidationResult } from '../../types/api.js';
import type { ReportActivityInput, ReportContentInput, ReportTarget, ReportTargetType } from './reports.types.js';

/** Only the account's reason/description; identities, snapshots and state belong to the server. */
export const parseActivityReport = (input: unknown): ValidationResult<ReportActivityInput> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, issues: [{ field: 'body', message: 'Se requiere un motivo para la denuncia.' }] };
  }
  const body = input as Record<string, unknown>;
  const issues: ApiErrorDetail[] = [];
  for (const field of Object.keys(body)) {
    if (!['reason', 'description'].includes(field)) issues.push({ field, message: 'Campo no admitido.' });
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!reason || reason.length > 200) issues.push({ field: 'reason', message: 'Escribe un motivo de entre 1 y 200 caracteres.' });
  if (body.description !== undefined && (typeof body.description !== 'string' || description.length > 2000)) {
    issues.push({ field: 'description', message: 'La descripción debe ser texto de hasta 2000 caracteres.' });
  }
  return issues.length ? { success: false, issues } : { success: true, data: { reason, ...(description ? { description } : {}) } };
};

export function parseReportTarget(input: unknown): ValidationResult<ReportTarget> {
  const body = input as Record<string, unknown> | null;
  const targetType = body?.targetType;
  const targetId = body?.targetId;
  const issues: ApiErrorDetail[] = [];
  if (typeof targetType !== 'string' || !['PUBLICACION_FISICA', 'PUBLICACION_DIGITAL', 'ACTIVIDAD', 'TRANSACCION'].includes(targetType)) {
    issues.push({ field: 'targetType', message: 'Selecciona una publicación, actividad o transacción.' });
  }
  const pattern = targetType === 'ACTIVIDAD' ? /^[0-9a-f]{24}$/i
    : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof targetId !== 'string' || !pattern.test(targetId)) {
    issues.push({ field: 'targetId', message: 'Identificador del elemento inválido.' });
  }
  return issues.length ? { success: false, issues } : {
    success: true, data: { targetType: targetType as ReportTargetType, targetId: (targetId as string).toLowerCase() },
  };
}

/** Target is a locator; campus, complainant, date, state and evidence remain server-owned. */
export const parseContentReport = (input: unknown): ValidationResult<ReportContentInput> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, issues: [{ field: 'body', message: 'Se requiere el elemento y un motivo para la denuncia.' }] };
  }
  const { targetType, targetId, ...fields } = input as Record<string, unknown>;
  const target = parseReportTarget({ targetType, targetId });
  const report = parseActivityReport(fields);
  const issues = [...(target.success ? [] : target.issues), ...(report.success ? [] : report.issues)];
  return target.success && report.success ? { success: true, data: { ...target.data, ...report.data } }
    : { success: false, issues };
};
