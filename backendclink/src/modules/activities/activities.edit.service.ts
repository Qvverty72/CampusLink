import { createHash } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { requireResourceOwner } from '../auth/auth.authorization.js';
import { getAuthorizedActiveMap } from '../maps/map.service.js';
import { ApiError } from '../../services/apiError.js';
import { resolveActivityLocation, spatialBuildings } from './activities.location.js';
import { parseRecurrenceRule } from './activities.series.validation.js';
import type { ActivityDocument } from './activities.types.js';
import type { ActivityEditDependencies, ActivityEditPreview, ActivityEditResult, ActivitySnapshot, EditActivityInput } from './activities.edit.types.js';

export const editRevision = (document: ActivityDocument): number => document.editRevision === undefined ? 0 : document.editRevision;
const snapshot = (document: ActivityDocument): ActivitySnapshot => ({ title: document.title, description: document.description,
  type: document.type, startAt: document.startAt, endAt: document.endAt, location: document.location as ActivitySnapshot['location'] });
const conflict = () => new ApiError(409, 'CONFLICT', 'La actividad o las ocurrencias cambiaron. Recarga la ficha y revisa una nueva vista previa.');
const valid = (document: ActivityDocument) => document._id?.toHexString?.() && document.startAt instanceof Date && document.endAt instanceof Date
  && Number.isFinite(document.startAt.getTime()) && Number.isFinite(document.endAt.getTime()) && document.endAt > document.startAt
  && Number.isSafeInteger(editRevision(document)) && editRevision(document) >= 0 && editRevision(document) < Number.MAX_SAFE_INTEGER;

/** Plan only existing instances. Series creation rules/IDs/past instances never regenerate. */
export async function previewActivityEdit(auth: VerifiedAuthConnection, activityId: string, input: EditActivityInput,
  dependencies: ActivityEditDependencies = {}): Promise<ActivityEditPreview> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'ID de actividad válido requerido.');
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const find = dependencies.findEditable ?? (await import('./activities.edit.repository.js')).findEditableActivity;
  const current = await find(auth.campusId, activityId);
  if (!current || current._id?.toHexString?.() !== activityId.toLowerCase() || current.campusId !== auth.campusId
    || current.status !== 'ACTIVE' || current.visibility !== 'PUBLIC' || !['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'].includes(current.type)) {
    throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible para editar.');
  }
  requireResourceOwner(auth, current.createdByUserId);
  if (!valid(current)) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Los datos de la publicación no están disponibles.');
  if (current.seriesId !== undefined && (typeof current.seriesId?.toHexString !== 'function'
    || !Number.isInteger(current.occurrenceIndex) || !Number.isInteger(current.occurrenceCount)
    || current.occurrenceIndex! < 1 || current.occurrenceCount! < current.occurrenceIndex! || current.occurrenceCount! > 200)) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'La identidad de la ocurrencia no está disponible.');
  }
  if (editRevision(current) !== input.expectedRevision) throw conflict();
  if (input.endAt <= input.startAt) throw new ApiError(400, 'VALIDATION_ERROR', 'El término debe ser posterior al inicio.');
  if (!resolveActivityLocation(spatialBuildings(map), input.location)) throw new ApiError(400, 'VALIDATION_ERROR', 'Selecciona una ubicación activa de tu campus.');
  const now = dependencies.now?.() ?? new Date(); let targets = [current]; let timeZone: string | undefined;
  if (input.scope === 'UPCOMING') {
    if (!current.seriesId || current.startAt <= now) throw new ApiError(400, 'VALIDATION_ERROR', 'Para cambiar las próximas, selecciona una ocurrencia que todavía no comenzó.');
    const id = current.seriesId.toHexString();
    const series = await (dependencies.findSeries ?? (await import('./activities.series.repository.js')).findActivitySeries)(auth.campusId, id);
    const rule = series && parseRecurrenceRule(series.recurrence);
    if (!series || series._id?.toHexString?.() !== id || series.campusId !== auth.campusId || series.createdByUserId !== auth.userId
      || series.type !== current.type || !rule?.success) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'La serie no está disponible para editar.');
    timeZone = rule.data.timeZone;
    const all = await (dependencies.findEditOccurrences ?? (await import('./activities.edit.repository.js')).findEditOccurrences)(auth.campusId, id);
    targets = all.filter(value => value.campusId === auth.campusId && value.seriesId?.toHexString?.() === id
      && value.status === 'ACTIVE' && value.visibility === 'PUBLIC' && value.startAt instanceof Date && value.startAt > now
      && Number.isInteger(value.occurrenceIndex) && value.occurrenceIndex! >= current.occurrenceIndex!);
    if (!targets.some(value => value._id?.toHexString?.() === activityId.toLowerCase()) || targets.length > 200 || !targets.length) throw conflict();
    if (targets.some(value => !valid(value) || value.createdByUserId !== auth.userId || value.type !== current.type
      || value.occurrenceCount !== current.occurrenceCount)) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Las ocurrencias no están disponibles para editar.');
    targets.sort((a, b) => a.occurrenceIndex! - b.occurrenceIndex!);
  }
  const shift = (value: Date, from: Date, to: Date): Date => {
    if (from.getTime() === to.getTime()) return value;
    const a = Temporal.Instant.from(from.toISOString()).toZonedDateTimeISO(timeZone!);
    const b = Temporal.Instant.from(to.toISOString()).toZonedDateTimeISO(timeZone!);
    const old = Temporal.Instant.from(value.toISOString()).toZonedDateTimeISO(timeZone!);
    try {
      return new Date(old.toPlainDate().add({ days: a.toPlainDate().until(b.toPlainDate()).days }).toPlainDateTime(b.toPlainTime())
        .toZonedDateTime(timeZone!, { disambiguation: 'reject' }).epochMilliseconds);
    } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'Una fecha resultante tiene una hora inexistente o ambigua. Ajusta la fecha u hora y revisa la vista previa.'); }
  };
  const changes = targets.map(document => {
    const before = snapshot(document);
    const samePlace = ['buildingKey', 'floorKey', 'poiKey'].every(key => (document.location[key as keyof ActivityDocument['location']] ?? '')
      === (input.location[key as keyof typeof input.location] ?? ''));
    const location = { ...input.location, ...(samePlace && document.location.coordinates ? { coordinates: document.location.coordinates } : {}) };
    const after: ActivitySnapshot = { title: input.title, description: input.description,
      type: document.type, location,
      startAt: input.scope === 'ONE' ? input.startAt : shift(document.startAt, current.startAt, input.startAt),
      endAt: input.scope === 'ONE' ? input.endAt : shift(document.endAt, current.endAt, input.endAt) };
    if (after.endAt <= after.startAt || (input.scope === 'UPCOMING' && after.startAt <= now)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Las próximas ocurrencias deben seguir sin comenzar y terminar después de su inicio.');
    }
    const changedFields = ['title', 'description', 'startAt', 'endAt', 'location'].filter(key =>
      JSON.stringify(before[key as keyof ActivitySnapshot]) !== JSON.stringify(after[key as keyof ActivitySnapshot]));
    return { activityId: document._id.toHexString(), ...(document.occurrenceIndex ? { index: document.occurrenceIndex } : {}),
      revision: editRevision(document), before, after, changedFields };
  });
  // Bind all targets, even unchanged ones, so previews cannot silently widen after another edit.
  const previewHash = createHash('sha256').update(JSON.stringify({ campusId: auth.campusId, activityId: activityId.toLowerCase(),
    input, timeZone, changes, previewHash: undefined }, (key, value) => key === 'previewHash' ? undefined : value)).digest('hex');
  return { campusId: auth.campusId, activityId: activityId.toLowerCase(), scope: input.scope, previewHash,
    ...(timeZone ? { timeZone } : {}), changes };
}

export async function editActivity(auth: VerifiedAuthConnection, activityId: string, input: EditActivityInput,
  dependencies: ActivityEditDependencies = {}): Promise<ActivityEditResult> {
  const plan = await previewActivityEdit(auth, activityId, input, dependencies);
  if (plan.previewHash !== input.previewHash) throw conflict();
  if (dependencies.saveEdit) return dependencies.saveEdit(plan);
  return (await import('./activities.edit.repository.js')).commitActivityEdit(auth, activityId, input, dependencies.now?.() ?? new Date());
}
