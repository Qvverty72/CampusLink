import type { RequestParser, ApiErrorDetail, ValidationResult } from '../../types/api.js';
import type { ContentReportInput } from './reports.types.js';

/** Acepta motivo y descripción; identidad, snapshot y estado se asignan exclusivamente en el servidor. */
export const parseContentReport: RequestParser = (input: unknown): ValidationResult<ContentReportInput> => {
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
  // PostgreSQL no admite NUL en texto ni JSON; se rechaza en la API para todos los objetivos.
  for (const [field, value] of [['reason', reason], ['description', description]]) {
    if (value.includes('\u0000')) issues.push({ field, message: 'El texto contiene caracteres inválidos.' });
  }
  return issues.length ? { success: false, issues } : { success: true, data: { reason, ...(description ? { description } : {}) } };
};
