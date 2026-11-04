import { resourceConditions } from '@/features/marketplace/physicalgoods/types/publication';
import type { ReportReviewDetail, ReportResolutionDetail } from '../types/review';
import { evidenceValue, reportTitle } from './reportPresentation';

export type ReportDetail = ReportReviewDetail | ReportResolutionDetail;
export const reportRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;

/** Presentación del contenido guardado; nunca completa el snapshot con datos actuales. */
export function reportContent(detail: ReportDetail) {
  const snapshot = reportRecord(detail.snapshot), publication = reportRecord(snapshot?.publication);
  const content = publication ?? (detail.entityType === 'ACTIVIDAD' || typeof snapshot?.title === 'string' ? snapshot : null);
  const modality = text(content?.modalidad);
  const amount = content?.precio;
  const numeric = typeof amount === 'number' && Number.isFinite(amount) ? amount
    : typeof amount === 'string' && /^\d+(\.\d+)?$/.test(amount) && Number.isFinite(Number(amount)) ? Number(amount) : null;
  const price = modality === 'DONACION' ? 'Donación' : numeric !== null ? evidenceValue('precio', numeric, content ?? {}) : null;
  const condition = text(content?.estado_uso);
  const conditionLabel = resourceConditions.find(item => item.value === condition)?.label ?? condition;
  const kind = text(content?.tipo_recurso);
  const state = text(content?.estado_publicacion ?? content?.status);
  const images = Array.isArray(content?.images) ? content.images.filter(item => !!reportRecord(item)) : [];
  const files = Array.isArray(content?.files) ? content.files.flatMap(file => {
    const record = reportRecord(file);
    return typeof record?.id === 'string' && typeof record.name === 'string' ? [{ id: record.id, name: record.name,
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : undefined,
      sizeBytes: typeof record.sizeBytes === 'number' && Number.isFinite(record.sizeBytes) && record.sizeBytes >= 0 ? record.sizeBytes : undefined,
    }] : [];
  }) : [];
  return {
    content, publication, title: reportTitle(text(content?.titulo ?? content?.title) ?? detail.title), price,
    description: text(content?.descripcion ?? content?.description), condition: conditionLabel,
    modality: modality ? evidenceValue('modalidad', modality) : null,
    kind: kind ? evidenceValue('tipo_recurso', kind) : null,
    state: state ? evidenceValue('status', state) : null,
    savedCampus: text(content?.campus_nombre), updatedAt: text(content?.updated_at ?? content?.updatedAt), images, files,
  };
}
