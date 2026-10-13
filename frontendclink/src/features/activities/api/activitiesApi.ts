import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { Activity, ActivityDetail, ActivityLocationQuery, ActivityParticipation } from '../types/activity';
import type { CreateActivityInput, CommunityActivityCreationAvailability } from '../types/creation';
import type { CreateActivitySeriesInput, ActivityRecurrencePreview, CreatedActivitySeries, ActivitySeries } from '../types/recurrence';
import type { ActivityEditPreview, ActivityEditResult, EditActivityInput } from '../types/editing';
import type { ActivityParticipantsPage, ActivityDeletionResult } from '../types/activity';
import { ACTIVITY_PARTICIPANTS_PAGE_SIZE } from '../types/activity';

export async function fetchCommunityActivityCreationAvailability(campusId: string, signal?: AbortSignal): Promise<CommunityActivityCreationAvailability> {
  const response = await authenticatedEnvelopeRequest<CommunityActivityCreationAvailability>('/api/v1/activities/community/creation-availability', { signal });
  const value = response.data;
  if (!value || value.campusId !== campusId || typeof value.canCreate !== 'boolean'
    || (!value.canCreate && (typeof value.message !== 'string' || !value.message.trim()))
    || (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 500))) {
    throw new Error('No se pudo comprobar si puedes crear una actividad.');
  }
  return value;
}

export async function fetchActivityParticipants(campusId: string, activityId: string, page: number, signal?: AbortSignal): Promise<ActivityParticipantsPage> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityParticipantsPage>(`/api/v1/activities/${activityId}/participants`, { signal },
    new URLSearchParams({ page: String(page), pageSize: String(ACTIVITY_PARTICIPANTS_PAGE_SIZE) }));
  const value = response.data;
  if (!value || value.campusId !== campusId || value.activityId !== activityId.toLowerCase()
    || !Number.isSafeInteger(value.total) || value.total < 0 || value.pageSize !== ACTIVITY_PARTICIPANTS_PAGE_SIZE
    || !Number.isSafeInteger(value.page) || value.page < 1 || value.page > Math.max(1, Math.ceil(value.total / value.pageSize))
    || !Array.isArray(value.participants) || value.participants.length > value.pageSize
    || value.participants.some(person => !person || typeof person.key !== 'string' || !person.key
      || typeof person.isCurrentUser !== 'boolean'
      || (person.name !== null && typeof person.name !== 'string'))) throw new Error('La lista de inscritos recibida es inválida.');
  return value;
}

export async function deleteActivity(campusId: string, activityId: string, expectedRevision: number, signal?: AbortSignal): Promise<ActivityDeletionResult> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityDeletionResult>(`/api/v1/activities/${activityId}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision }), signal,
  });
  const value = response.data;
  if (!value || value.activityId !== activityId.toLowerCase() || value.campusId !== campusId
    || value.revision !== expectedRevision + 1 || !Number.isFinite(Date.parse(value.deletedAt))) throw new Error('No se pudo confirmar la eliminación.');
  return value;
}

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

async function requestActivityDetail(campusId: string, activityId: string, register: boolean, signal?: AbortSignal, operationId?: string): Promise<ActivityDetail> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityDetail>(
    `/api/v1/activities/${activityId}${register ? '/participation' : ''}`,
    { method: register ? 'PUT' : 'GET', signal, ...(register && operationId ? { headers: { 'Idempotency-Key': operationId } } : {}) },
  );
  if (!response.data || response.data.id !== activityId.toLowerCase() || response.data.campusId !== campusId
    || typeof response.data.participation?.canLeave !== 'boolean'
    || (response.data.participantCount !== undefined
      && (!Number.isSafeInteger(response.data.participantCount) || response.data.participantCount < 0))) {
    throw new Error('La actividad recibida no corresponde a esta consulta.');
  }
  return response.data;
}

export const fetchActivityDetail = (campusId: string, activityId: string, signal?: AbortSignal) =>
  requestActivityDetail(campusId, activityId, false, signal);

export const registerActivityParticipation = (campusId: string, activityId: string, signal?: AbortSignal, operationId?: string) =>
  requestActivityDetail(campusId, activityId, true, signal, operationId);

async function requestOwnParticipation(campusId: string, activityId: string, method: 'GET' | 'DELETE', signal?: AbortSignal, operationId?: string): Promise<ActivityParticipation> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new Error('Identificador de actividad inválido.');
  const response = await authenticatedEnvelopeRequest<ActivityParticipation>(
    `/api/v1/activities/${activityId}/participation`, { method, signal, ...(operationId ? { headers: { 'Idempotency-Key': operationId } } : {}) });
  const value = response.data;
  if (!value || value.activityId !== activityId.toLowerCase() || value.campusId !== campusId
    || !['JOINED', 'LEFT', 'NOT_JOINED'].includes(value.status)
    || typeof value.canLeave !== 'boolean'
    || (value.status !== 'NOT_JOINED' && (!value.joinedAt || !Number.isFinite(Date.parse(value.joinedAt))
      || !value.updatedAt || !Number.isFinite(Date.parse(value.updatedAt))))) {
    throw new Error('No se pudo confirmar tu estado de participación.');
  }
  return value;
}

export const fetchActivityParticipation = (campusId: string, activityId: string, signal?: AbortSignal) =>
  requestOwnParticipation(campusId, activityId, 'GET', signal);

export const withdrawActivityParticipation = (campusId: string, activityId: string, signal?: AbortSignal, operationId?: string) =>
  requestOwnParticipation(campusId, activityId, 'DELETE', signal, operationId);

export async function recordViewedActivity(campusId: string, activityId: string, operationId: string, signal?: AbortSignal): Promise<void> {
  const response = await authenticatedEnvelopeRequest<{ campusId: string; activityId: string; type: string; recorded: boolean }>(
    `/api/v1/activities/${activityId}/interactions`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'VIEWED', operationId }) });
  if (response.data?.campusId !== campusId || response.data.activityId !== activityId || response.data.type !== 'VIEWED'
    || response.data.recorded !== true) throw new Error('No se pudo confirmar la interacción.');
}
