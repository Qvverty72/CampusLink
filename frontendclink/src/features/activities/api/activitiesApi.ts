import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { Activity, ActivityLocationQuery } from '../types/activity';

export async function fetchLocationActivities(campusId: string, query: ActivityLocationQuery, signal?: AbortSignal): Promise<Activity[]> {
  const search = new URLSearchParams();
  for (const key of ['buildingKey', 'floorKey', 'poiKey'] as const) {
    if (query[key]) search.set(key, query[key]);
  }
  const response = await authenticatedEnvelopeRequest<Activity[]>('/api/v1/activities', { signal }, search);
  if (!Array.isArray(response.data) || response.data.some(activity => activity.campusId !== campusId)) {
    throw new Error('Las actividades recibidas no corresponden a tu campus.');
  }
  return response.data;
}
