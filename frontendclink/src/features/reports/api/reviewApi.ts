import { authenticatedEnvelopeRequest, authenticatedRequest } from '@/lib/api/authenticated-request';
import { isReviewDetail, isReviewPage, isReviewObject } from '../types/review';
import type { ReviewDetail, ReviewFilters, ReviewPage } from '../types/review';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function path(campusId: string) {
  if (!uuid.test(campusId)) throw new Error('Campus inválido.');
  return '/api/v1/reports/campuses/' + encodeURIComponent(campusId.toLowerCase());
}
export async function loadReviewCampuses(signal: AbortSignal): Promise<{ id: string; name: string }[]> {
  const data = await authenticatedRequest<unknown>('/api/v1/reports/campuses', { signal });
  if (!Array.isArray(data) || !data.every(row => isReviewObject(row) && typeof row.id === 'string'
    && uuid.test(row.id) && typeof row.name === 'string')) throw new Error('No se pudieron confirmar los campus disponibles.');
  return data;
}
export async function loadReviewReports(campusId: string, page: number, filters: ReviewFilters, signal: AbortSignal): Promise<ReviewPage> {
  const query = new URLSearchParams({ page: String(page), limit: '20',
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
  });
  const result = await authenticatedEnvelopeRequest<unknown>(path(campusId), { signal }, query);
  if (!isReviewPage(result, campusId.toLowerCase(), page)) throw new Error('No se pudo confirmar el listado de denuncias.');
  return result;
}
export async function loadReviewReport(campusId: string, id: string, signal: AbortSignal): Promise<ReviewDetail> {
  if (!uuid.test(id)) throw new Error('Denuncia inválida.');
  const data = await authenticatedRequest<unknown>(path(campusId) + '/' + encodeURIComponent(id.toLowerCase()), { signal });
  if (!isReviewDetail(data, campusId.toLowerCase(), id.toLowerCase())) throw new Error('No se pudo confirmar el detalle de la denuncia.');
  return data;
}
