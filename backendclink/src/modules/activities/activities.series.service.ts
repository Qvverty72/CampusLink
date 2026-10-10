import { ObjectId } from 'mongodb';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { getAuthorizedActiveMap } from '../maps/map.service.js';
import { ApiError } from '../../services/apiError.js';
import { prepareActivityDocument, createdActivityDetail } from './activities.create.service.js';
import { expandActivityRecurrence } from './activities.recurrence.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity } from './activities.policy.js';
import { parseRecurrenceRule } from './activities.series.validation.js';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityDetailDto, ActivitySeriesDocument, ActivitySeriesDto, CreateActivitySeriesInput } from './activities.types.js';

export async function previewActivitySeries(auth: VerifiedAuthConnection, input: CreateActivitySeriesInput,
  dependencies: ActivityDependencies = {}, official = false) {
  const document = await prepareActivityDocument(auth, input, official ? 'OFFICIAL_EVENT' : 'COMMUNITY_ACTIVITY', dependencies);
  return expandActivityRecurrence(input, auth.campusId, document.type as 'COMMUNITY_ACTIVITY' | 'OFFICIAL_EVENT', document.createdAt);
}

export async function createActivitySeries(auth: VerifiedAuthConnection, input: CreateActivitySeriesInput,
  dependencies: ActivityDependencies = {}, official = false): Promise<{ series: ActivitySeriesDto; firstOccurrence: ActivityDetailDto }> {
  const base = await prepareActivityDocument(auth, input, official ? 'OFFICIAL_EVENT' : 'COMMUNITY_ACTIVITY', dependencies);
  const preview = expandActivityRecurrence(input, auth.campusId, official ? 'OFFICIAL_EVENT' : 'COMMUNITY_ACTIVITY', base.createdAt);
  if (input.previewHash !== preview.previewHash) throw new ApiError(409, 'CONFLICT', 'La configuración cambió. Revisa una nueva vista previa antes de publicar.');
  const series: ActivitySeriesDocument = { _id: base._id, campusId: auth.campusId, createdByUserId: auth.userId,
    title: base.title, description: base.description, type: preview.type, status: 'ACTIVE', visibility: 'PUBLIC',
    startAt: base.startAt, endAt: base.endAt, location: input.location, recurrence: preview.recurrence,
    occurrenceCount: preview.occurrences.length, skipped: preview.skipped, createdAt: base.createdAt, updatedAt: base.updatedAt };
  const documents = preview.occurrences.map(value => ({ ...base, _id: new ObjectId(), startAt: new Date(value.startAt), endAt: new Date(value.endAt),
    seriesId: series._id, occurrenceIndex: value.index, occurrenceCount: series.occurrenceCount, originalStartAt: new Date(value.startAt) }));
  const persist = dependencies.createSeries ?? (await import('./activities.series.repository.js')).insertActivitySeries;
  const occurrences = await persist(series, documents);
  const dto: ActivitySeriesDto = { id: series._id.toHexString(), campusId: series.campusId, title: series.title, description: series.description,
    type: series.type, recurrence: series.recurrence, occurrenceCount: series.occurrenceCount, occurrences };
  return { series: dto, firstOccurrence: createdActivityDetail(auth, occurrences[0]) };
}

export async function getActivitySeries(auth: VerifiedAuthConnection, seriesId: string, dependencies: ActivityDependencies = {}): Promise<ActivitySeriesDto> {
  if (!/^[0-9a-f]{24}$/i.test(seriesId)) throw new ApiError(400, 'VALIDATION_ERROR', 'ID de serie válido requerido.');
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const repository = dependencies.findSeries && dependencies.findSeriesOccurrences ? null : await import('./activities.series.repository.js');
  const series = await (dependencies.findSeries ?? repository!.findActivitySeries)(auth.campusId, seriesId);
  if (!series || series._id?.toHexString() !== seriesId.toLowerCase() || series.campusId !== auth.campusId
    || series.status !== 'ACTIVE' || series.visibility !== 'PUBLIC') throw new ApiError(404, 'NOT_FOUND', 'La serie no está disponible.');
  const rule = parseRecurrenceRule(series.recurrence);
  if (!rule.success || !Number.isInteger(series.occurrenceCount) || series.occurrenceCount < 1 || series.occurrenceCount > 200) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Los datos de la serie no están disponibles.');
  }
  const now = dependencies.now?.() ?? new Date();
  const documents = await (dependencies.findSeriesOccurrences ?? repository!.findActivitySeriesOccurrences)(auth.campusId, seriesId, now);
  const occurrences = documents.flatMap(document => {
    if (document.seriesId?.toHexString?.() !== seriesId.toLowerCase() || document.type !== series.type
      || document.occurrenceCount !== series.occurrenceCount) return [];
    const dto = toVisibleActivity(document, auth.campusId, now, spatialBuildings(map)); return dto ? [dto] : [];
  }).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
  // The public series browser must not reveal hidden/expired publications via the template.
  if (!occurrences.length) throw new ApiError(404, 'NOT_FOUND', 'La serie no tiene ocurrencias vigentes disponibles.');
  return { id: seriesId.toLowerCase(), campusId: auth.campusId, title: occurrences[0].title, description: occurrences[0].description,
    type: occurrences[0].type, recurrence: rule.data, occurrenceCount: series.occurrenceCount, occurrences };
}
