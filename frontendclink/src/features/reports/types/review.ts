import type { ReportTargetType } from './report';

export type ReviewTargetType = ReportTargetType | 'COMPORTAMIENTO';
export type ReviewStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESESTIMADO';
export interface ReviewSummary {
  id: string; campusId: string; targetType: ReviewTargetType; targetId: string;
  title: string | null; reason: string; status: ReviewStatus; reportedAt: string;
}
export interface ReviewPerson { id: string; name: string | null }
export interface ReviewDetail extends ReviewSummary {
  description: string | null; reporter: ReviewPerson;
  snapshot: Record<string, unknown> | null; current: Record<string, unknown> | null;
  participants: ReviewPerson[]; activityChanges: Record<string, unknown>[];
}
export interface ReviewPage { data: ReviewSummary[]; meta: { page: number; limit: number; hasMore: boolean } }
export interface ReviewFilters { status?: ReviewStatus; targetType?: ReviewTargetType }
export const reviewStatusLabels: Record<ReviewStatus, string> = {
  PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', RESUELTO: 'Resuelta', DESESTIMADO: 'Desestimada',
};
export const reviewTypeLabels: Record<ReviewTargetType, string> = {
  PUBLICACION_FISICA: 'Publicación física', PUBLICACION_DIGITAL: 'Publicación digital',
  ACTIVIDAD: 'Actividad', TRANSACCION: 'Transacción', COMPORTAMIENTO: 'Comportamiento (registro anterior)',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isReviewObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isReviewSummary(value: unknown, campusId: string): value is ReviewSummary {
  return isReviewObject(value) && typeof value.id === 'string' && uuid.test(value.id)
    && value.campusId === campusId && typeof value.targetId === 'string'
    && typeof value.targetType === 'string' && Object.hasOwn(reviewTypeLabels, value.targetType)
    && typeof value.status === 'string' && Object.hasOwn(reviewStatusLabels, value.status)
    && typeof value.reason === 'string' && (value.title === null || typeof value.title === 'string')
    && typeof value.reportedAt === 'string' && Number.isFinite(Date.parse(value.reportedAt));
}
function person(value: unknown): value is ReviewPerson {
  return isReviewObject(value) && typeof value.id === 'string' && uuid.test(value.id)
    && (value.name === null || typeof value.name === 'string');
}
export function isReviewDetail(value: unknown, campusId: string, id: string): value is ReviewDetail {
  if (!isReviewSummary(value, campusId) || value.id !== id) return false;
  const detail = value as unknown as ReviewDetail;
  return (detail.description === null || typeof detail.description === 'string') && person(detail.reporter)
    && (detail.snapshot === null || isReviewObject(detail.snapshot)) && (detail.current === null || isReviewObject(detail.current))
    && Array.isArray(detail.participants) && detail.participants.every(person)
    && Array.isArray(detail.activityChanges) && detail.activityChanges.every(isReviewObject);
}
export function isReviewPage(value: unknown, campusId: string, page: number): value is ReviewPage {
  if (!isReviewObject(value) || !Array.isArray(value.data) || !isReviewObject(value.meta)) return false;
  return value.data.every(row => isReviewSummary(row, campusId)) && value.meta.page === page
    && value.meta.limit === 20 && value.data.length <= 20 && typeof value.meta.hasMore === 'boolean';
}
