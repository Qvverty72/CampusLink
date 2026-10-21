import type { ContentReportInput, ContentReportReceipt } from '@/features/reports/types/contentReport';
/** Códigos persistidos: no renombrar ni reutilizar para otro significado. Paridad validada en backend. */
export const ACTIVITY_REPORT_REASONS = [
  { code: 'ACTIVITY_SPAM', label: 'Spam o publicidad no relacionada' },
  { code: 'ACTIVITY_FALSE_INFORMATION', label: 'Información falsa o engañosa' },
  { code: 'ACTIVITY_HARASSMENT', label: 'Acoso o intimidación' },
  { code: 'ACTIVITY_HATE_DISCRIMINATION', label: 'Discriminación o discurso de odio' },
  { code: 'ACTIVITY_INAPPROPRIATE_CONTENT', label: 'Contenido inapropiado' },
  { code: 'ACTIVITY_DANGEROUS', label: 'Actividad peligrosa' },
  { code: 'ACTIVITY_OTHER', label: 'Otro motivo' },
] as const;
/** reason debe ser un código del catálogo; descripción opcional para ampliar el caso. */
export type ActivityReportInput = ContentReportInput;
/** Acuse privado con los datos enviados por su propietario; no incluye notas administrativas. */
export interface ActivityReportReceipt extends ContentReportReceipt {activityId:string;reason:string;description:string|null}

export function isActivityReportReceipt(receipt: ContentReportReceipt): receipt is ActivityReportReceipt {
  return 'activityId' in receipt && typeof receipt.activityId === 'string'
    && 'reason' in receipt && typeof receipt.reason === 'string'
    && 'description' in receipt && (receipt.description === null || typeof receipt.description === 'string');
}
