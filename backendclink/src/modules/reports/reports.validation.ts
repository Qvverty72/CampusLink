import type { RequestParser, ApiErrorDetail, ValidationResult } from '../../types/api.js';
import type { ContentReportInput } from './reports.types.js';

/** Contrato persistido en reporte_contenido.motivo; conservar códigos aunque cambien etiquetas. */
export const ACTIVITY_REPORT_REASON_CODES = [
  'ACTIVITY_SPAM', 'ACTIVITY_FALSE_INFORMATION', 'ACTIVITY_HARASSMENT',
  'ACTIVITY_HATE_DISCRIMINATION', 'ACTIVITY_INAPPROPRIATE_CONTENT', 'ACTIVITY_DANGEROUS', 'ACTIVITY_OTHER',
] as const;

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
  return issues.length ? { success: false, issues } : { success: true, data: { reason, ...(description ? { description } : {}) } };
};

/** Solo las denuncias nuevas de actividades requieren motivo estructurado. */
export const parseActivityReport: RequestParser = (input: unknown): ValidationResult<ContentReportInput> => {
  const parsed = parseContentReport(input);
  if (!parsed.success) return parsed;
  const data = parsed.data as ContentReportInput;
  if (!ACTIVITY_REPORT_REASON_CODES.some(code => code === data.reason)) {
    return { success: false, issues: [{ field: 'reason', message: 'Selecciona un motivo válido de la lista.' }] };
  }
  return { success: true, data };
};
