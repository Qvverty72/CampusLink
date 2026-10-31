import { createHash } from 'node:crypto';
import type { VerifiedAuthConnection } from '../auth/types/auth.types.js';
import { requireResourceOwner } from '../auth/domain/auth.authorization.js';
import { getAuthorizedActiveMap } from '../maps/services/map.service.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { resolveActivityLocation, spatialBuildings } from './activities.location.js';
import type { ActivityDocument } from './activities.types.js';
import type { ActivityEditDependencies, ActivityEditPreview, ActivityEditResult, ActivitySnapshot, EditActivityInput } from './activities.edit.types.js';

export const editRevision = (document: ActivityDocument): number => document.editRevision === undefined ? 0 : document.editRevision;
const snapshot = (document: ActivityDocument): ActivitySnapshot => ({ title: document.title, description: document.description,
  type: document.type, status: document.status, startAt: document.startAt, endAt: document.endAt, location: document.location as ActivitySnapshot['location'] });
const conflict = () => new ApiError(409, 'CONFLICT', 'La actividad o las ocurrencias cambiaron. Recarga la ficha y revisa una nueva vista previa.');
const valid = (document: ActivityDocument) => document._id?.toHexString?.() && document.startAt instanceof Date && document.endAt instanceof Date
  && Number.isFinite(document.startAt.getTime()) && Number.isFinite(document.endAt.getTime()) && document.endAt > document.startAt
  && Number.isSafeInteger(editRevision(document)) && editRevision(document) >= 0 && editRevision(document) < Number.MAX_SAFE_INTEGER;

/** Protege también llamadas directas de servicios y repositorios frente a clientes antiguos. */
export function requireIndividualEdit(scope: unknown): void {
  if (scope !== 'ONE') throw new ApiError(400, 'VALIDATION_ERROR', 'Solo se permite editar una actividad u ocurrencia individual.');
}

/**
 * Construye una vista previa de una sola actividad u ocurrencia y su hash de contenido/revisión.
 * Las demás ocurrencias y la definición de la serie quedan fuera del plan.
 */
export async function previewActivityEdit(auth: VerifiedAuthConnection, activityId: string, input: EditActivityInput,
  dependencies: ActivityEditDependencies = {}): Promise<ActivityEditPreview> {
  if (!/^[0-9a-f]{24}$/i.test(activityId)) throw new ApiError(400, 'VALIDATION_ERROR', 'ID de actividad válido requerido.');
  requireIndividualEdit(input.scope);
  const map = await getAuthorizedActiveMap(auth, auth.campusId, dependencies.getActiveMap);
  const find = dependencies.findEditable ?? (await import('./activities.edit.repository.js')).findEditableActivity;
  const current = await find(auth.campusId, activityId);
  if (!current || current._id?.toHexString?.() !== activityId.toLowerCase() || current.campusId !== auth.campusId
    || !['ACTIVE', 'FINISHED'].includes(current.status) || current.deletedAt != null
    || current.visibility !== 'PUBLIC' || !['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'].includes(current.type)) {
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
  const now = dependencies.now?.() ?? new Date();
  const changes = [current].map(document => {
    const before = snapshot(document);
    const samePlace = ['buildingKey', 'floorKey', 'poiKey'].every(key => (document.location[key as keyof ActivityDocument['location']] ?? '')
      === (input.location[key as keyof typeof input.location] ?? ''));
    const location = { ...input.location, ...(samePlace && document.location.coordinates ? { coordinates: document.location.coordinates } : {}) };
    const after: ActivitySnapshot = { title: input.title, description: input.description,
      type: document.type, location,
      startAt: input.startAt, endAt: input.endAt };
    after.status = after.endAt > now ? 'ACTIVE' : 'FINISHED';
    const changedFields = ['title', 'description', 'startAt', 'endAt', 'location', 'status'].filter(key =>
      JSON.stringify(before[key as keyof ActivitySnapshot]) !== JSON.stringify(after[key as keyof ActivitySnapshot]));
    return { activityId: document._id.toHexString(), ...(document.occurrenceIndex ? { index: document.occurrenceIndex } : {}),
      revision: editRevision(document), before, after, changedFields };
  });
  // Vincula revisión y contenido seleccionados, incluso en cambios vacíos, para detectar concurrencia.
  const previewHash = createHash('sha256').update(JSON.stringify({ campusId: auth.campusId, activityId: activityId.toLowerCase(),
    input, changes, previewHash: undefined }, (key, value) => key === 'previewHash' ? undefined : value)).digest('hex');
  return { campusId: auth.campusId, activityId: activityId.toLowerCase(), scope: input.scope, previewHash,
    changes };
}

/** Exige una vista previa coincidente antes de delegar la escritura transaccional. */
export async function editActivity(auth: VerifiedAuthConnection, activityId: string, input: EditActivityInput,
  dependencies: ActivityEditDependencies = {}): Promise<ActivityEditResult> {
  const plan = await previewActivityEdit(auth, activityId, input, dependencies);
  if (plan.previewHash !== input.previewHash) throw conflict();
  if (dependencies.saveEdit) return dependencies.saveEdit(plan);
  return (await import('./activities.edit.repository.js')).commitActivityEdit(auth, activityId, input, dependencies.now?.() ?? new Date());
}
