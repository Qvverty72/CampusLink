import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { Activity, ActivityDetail, ActivityLocationQuery, ActivityParticipation } from '../types/activity';
import type { CreateActivityInput } from '../types/creation';
import type { CreateActivitySeriesInput, ActivityRecurrencePreview, CreatedActivitySeries, ActivitySeries } from '../types/recurrence';
import type { ActivityEditPreview, ActivityEditResult, EditActivityInput } from '../types/editing';

export async function previewActivityEdit(campusId: string, activityId: string, input: EditActivityInput, signal?: AbortSignal): Promise<ActivityEditPreview> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('ID inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityEditPreview>(`/api/v1/activities/${activityId}/edit/preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  if (!response.data || response.data.campusId !== campusId || response.data.activityId !== activityId.toLowerCase()
    || !/^[0-9a-f]{64}$/.test(response.data.previewHash) || !Array.isArray(response.data.changes)) throw new Error('Edición recibida inválida.');
  return response.data;
}
export async function saveActivityEdit(_campusId: string, activityId: string, input: EditActivityInput, signal?: AbortSignal): Promise<ActivityEditResult> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('ID inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityEditResult>(`/api/v1/activities/${activityId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  if (!response.data || response.data.activityId !== activityId.toLowerCase() || !Number.isSafeInteger(response.data.updatedCount)
    || response.data.updatedCount < 0 || !Number.isSafeInteger(response.data.revision)) throw new Error('No se pudo confirmar la edición.');
  return response.data;
}

export async function previewActivitySeries(campusId: string, input: CreateActivitySeriesInput, official: boolean, signal?: AbortSignal): Promise<ActivityRecurrencePreview> {
  const response = await authenticatedEnvelopeRequest<ActivityRecurrencePreview>(official ? '/api/v1/activities/series/official/preview' : '/api/v1/activities/series/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  const value = response.data;
  if (!value || value.campusId !== campusId || value.type !== (official ? 'OFFICIAL_EVENT' : 'COMMUNITY_ACTIVITY')
    || !/^[0-9a-f]{64}$/.test(value.previewHash) || !Array.isArray(value.occurrences) || !value.occurrences.length) throw new Error('Vista previa inválida.');
  return value;
}

export async function createActivitySeries(campusId: string, input: CreateActivitySeriesInput, official: boolean, signal?: AbortSignal): Promise<CreatedActivitySeries> {
  const response = await authenticatedEnvelopeRequest<CreatedActivitySeries>(official ? '/api/v1/activities/series/official' : '/api/v1/activities/series', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  const value = response.data;
  if (!value?.series || value.series.campusId !== campusId || value.series.type !== (official ? 'OFFICIAL_EVENT' : 'COMMUNITY_ACTIVITY')
    || !/^[0-9a-f]{24}$/.test(value.series.id) || value.firstOccurrence?.campusId !== campusId
    || value.firstOccurrence.series?.id !== value.series.id || value.firstOccurrence.participation?.status !== 'JOINED') throw new Error('No se pudo confirmar la serie publicada.');
  return value;
}

export async function fetchActivitySeries(campusId: string, seriesId: string, signal?: AbortSignal): Promise<ActivitySeries> {
  if (!/^[0-9a-f]{24}$/i.test(seriesId)) throw new Error('ID de serie inválido.');
  const response = await authenticatedEnvelopeRequest<ActivitySeries>(`/api/v1/activities/series/${seriesId}`, { signal });
  if (!response.data || response.data.id !== seriesId.toLowerCase() || response.data.campusId !== campusId
    || !Array.isArray(response.data.occurrences) || response.data.occurrences.some(activity => activity.campusId !== campusId || activity.series?.id !== seriesId.toLowerCase())) {
    throw new Error('La serie recibida no corresponde a esta consulta.');
  }
  return response.data;
}

async function publishActivity(campusId: string, input: CreateActivityInput, official: boolean, signal?: AbortSignal): Promise<ActivityDetail> {
  const response = await authenticatedEnvelopeRequest<ActivityDetail>(official ? '/api/v1/activities/official' : '/api/v1/activities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  if (!response.data || response.data.campusId !== campusId || response.data.type !== (official ? 'OFFICIAL_EVENT' : 'COMMUNITY_ACTIVITY')
    || !/^[0-9a-f]{24}$/.test(response.data.id) || response.data.participation?.status !== 'JOINED') {
    throw new Error('No se pudo confirmar la actividad publicada.');
  }
  return response.data;
}

export const createCommunityActivity = (campusId: string, input: CreateActivityInput, signal?: AbortSignal) =>
  publishActivity(campusId, input, false, signal);

export const createOfficialEvent = (campusId: string, input: CreateActivityInput, signal?: AbortSignal) =>
  publishActivity(campusId, input, true, signal);

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

async function requestOwnParticipation(campusId: string, activityId: string, method: 'GET' | 'DELETE', signal?: AbortSignal): Promise<ActivityParticipation> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityParticipation>(
    `/api/v1/activities/${activityId}/participation`, { method, signal });
  const value = response.data;
  if (!value || value.activityId !== activityId.toLowerCase() || value.campusId !== campusId
    || !['JOINED', 'LEFT', 'NOT_JOINED'].includes(value.status)
    || (value.status !== 'NOT_JOINED' && (!value.joinedAt || !Number.isFinite(Date.parse(value.joinedAt))
      || !value.updatedAt || !Number.isFinite(Date.parse(value.updatedAt))))) {
    throw new Error('No se pudo confirmar tu estado de participación.');
  }
  return value;
}

export const fetchActivityParticipation = (campusId: string, activityId: string, signal?: AbortSignal) =>
  requestOwnParticipation(campusId, activityId, 'GET', signal);

export const withdrawActivityParticipation = (campusId: string, activityId: string, signal?: AbortSignal) =>
  requestOwnParticipation(campusId, activityId, 'DELETE', signal);
