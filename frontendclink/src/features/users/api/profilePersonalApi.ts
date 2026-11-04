import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { Activity } from '@/features/activities/types/activity';

export interface ProfileOverview {
  activePublications: number; pendingRequests: number; transactions: number; acquiredResources: number;
}
export interface OwnActivitiesPage {
  campusId: string; items: Activity[]; total: number; page: number; limit: number; hasMore: boolean;
}

export async function fetchOwnActivityCount(campusId: string, signal?: AbortSignal): Promise<number> {
  const { data } = await authenticatedEnvelopeRequest<{ campusId: string; total: number }>('/api/v1/activities/mine/count', { signal });
  if (!data || data.campusId !== campusId || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new Error('No se pudo cargar el total de inscripciones.');
  }
  return data.total;
}

export async function fetchProfileOverview(signal?: AbortSignal): Promise<ProfileOverview> {
  const { data } = await authenticatedEnvelopeRequest<ProfileOverview>('/api/v1/users/me/overview', { signal });
  if (!data || ['activePublications', 'pendingRequests', 'transactions', 'acquiredResources'].some(key => {
    const count = data[key as keyof ProfileOverview];
    return !Number.isSafeInteger(count) || count < 0;
  })) throw new Error('No se pudo cargar el resumen personal.');
  return data;
}

export async function fetchOwnActivities(campusId: string, page = 1, signal?: AbortSignal, limit = 10): Promise<OwnActivitiesPage> {
  const { data } = await authenticatedEnvelopeRequest<OwnActivitiesPage>('/api/v1/activities/mine', { signal },
    new URLSearchParams({ page: String(page), limit: String(limit) }));
  if (!data || data.campusId !== campusId || data.page !== page || data.limit !== limit
    || !Number.isSafeInteger(data.total) || data.total < 0 || typeof data.hasMore !== 'boolean'
    || !Array.isArray(data.items) || data.items.length > limit
    || data.items.some(item => !item || item.campusId !== campusId || !/^[0-9a-f]{24}$/.test(item.id)
      || typeof item.title !== 'string' || typeof item.description !== 'string' || item.status !== 'ACTIVE'
      || !['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'].includes(item.type)
      || !Number.isFinite(Date.parse(item.startAt)) || !Number.isFinite(Date.parse(item.endAt))
      || Date.parse(item.startAt) >= Date.parse(item.endAt) || !item.location
      || typeof item.location.buildingName !== 'string' || typeof item.location.floorName !== 'string')) {
    throw new Error('No se pudieron cargar tus inscripciones.');
  }
  return data;
}
