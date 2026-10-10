import type { RequestParser, ApiErrorDetail, ValidationResult } from '../../types/api.js';
import type { ReportActivityInput } from './reports.types.js';

/** Only the account's reason/description; identities, snapshots and state belong to the server. */
export const parseActivityReport: RequestParser = (input: unknown): ValidationResult<ReportActivityInput> => {
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
