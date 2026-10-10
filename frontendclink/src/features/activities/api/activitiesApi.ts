import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { Activity, ActivityDetail, ActivityLocationQuery } from '../types/activity';
import type { CreateCommunityActivityInput } from '../types/creation';

export async function createCommunityActivity(campusId: string, input: CreateCommunityActivityInput, signal?: AbortSignal): Promise<ActivityDetail> {
  const response = await authenticatedEnvelopeRequest<ActivityDetail>('/api/v1/activities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  if (!response.data || response.data.campusId !== campusId || response.data.type !== 'COMMUNITY_ACTIVITY'
    || !/^[0-9a-f]{24}$/.test(response.data.id) || response.data.participation.status !== 'JOINED') {
    throw new Error('No se pudo confirmar la actividad publicada.');
  }
  return response.data;
}

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

async function requestActivityDetail(campusId: string, activityId: string, register: boolean, signal?: AbortSignal): Promise<ActivityDetail> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityDetail>(
    `/api/v1/activities/${activityId}${register ? '/participation' : ''}`,
    { method: register ? 'PUT' : 'GET', signal },
  );
  if (!response.data || response.data.id !== activityId.toLowerCase() || response.data.campusId !== campusId) {
    throw new Error('La actividad recibida no corresponde a esta consulta.');
  }
  return response.data;
}

export const fetchActivityDetail = (campusId: string, activityId: string, signal?: AbortSignal) =>
  requestActivityDetail(campusId, activityId, false, signal);

export const registerActivityParticipation = (campusId: string, activityId: string, signal?: AbortSignal) =>
  requestActivityDetail(campusId, activityId, true, signal);
