import type { ContentReportTarget } from '@/features/reports/types/contentReport';

export type MarketplaceReportTarget = Exclude<ContentReportTarget, { type: 'ACTIVIDAD' }>;

/** Sugerencias de texto del formulario; el contrato de reportes sigue admitiendo motivo libre. */
export const MARKETPLACE_REPORT_REASONS = [
  { id: 'misleading', label: 'Información engañosa', hint: 'El recurso no coincide con lo publicado.' },
  { id: 'inappropriate', label: 'Contenido inapropiado', hint: 'El contenido requiere revisión.' },
  { id: 'spam', label: 'Spam o publicidad', hint: 'Contenido repetitivo o publicitario.' },
  { id: 'exchange', label: 'Problema con el intercambio', hint: 'Un comportamiento relacionado con este acuerdo.' },
  { id: 'other', label: 'Otro motivo', hint: 'Describe el motivo de tu denuncia.' },
] as const;
