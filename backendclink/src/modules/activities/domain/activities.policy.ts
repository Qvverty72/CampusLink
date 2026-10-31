import type { Filter } from 'mongodb';
import { resolveActivityLocation, spatialBuildings } from './activities.location.js';
import type { ActivityDocument, ActivityDto, ActivityQuery } from '../types/activities.types.js';
import { relationalUuid } from '../services/activities.references.service.js';

export const COMMUNITY_ACTIVITY_LIMIT_MESSAGE = 'Solo puedes tener activa una actividad comunitaria.';

/** Las publicaciones futuras o vigentes reservan el cupo del creador en todo el campus. */
export function activeCommunityActivityFilter(campusId: string, userId: string, now: Date): Filter<ActivityDocument> {
  return { ...visibleActivityFilter(campusId, now), createdByUserId: userId, type: 'COMMUNITY_ACTIVITY' };
}

/** La misma política de publicación rige listados, detalle directo e inscripciones. */
export function visibleActivityFilter(campusId: string, now: Date): Filter<ActivityDocument> {
  return { campusId, status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null,
    type: { $in: ['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'] }, endAt: { $gt: now } };
}

/** Valida la publicación y resuelve su ubicación antes de crear el DTO visible para el cliente. */
export function toVisibleActivity(document: ActivityDocument, campusId: string, now: Date,
  buildings: ReturnType<typeof spatialBuildings>, query: ActivityQuery = {}): ActivityDto | null {
  if (document.campusId !== campusId || document.status !== 'ACTIVE' || document.visibility !== 'PUBLIC'
    || typeof document.createdByUserId !== 'string' || !relationalUuid.test(document.createdByUserId)
    || document.deletedAt != null
    || !['COMMUNITY_ACTIVITY', 'OFFICIAL_EVENT'].includes(document.type)
    || !(document.startAt instanceof Date) || !(document.endAt instanceof Date)
    || !Number.isFinite(document.startAt.getTime()) || !Number.isFinite(document.endAt.getTime())
    || document.endAt <= now || document.endAt <= document.startAt
    || typeof document.title !== 'string' || typeof document.description !== 'string'
    || !document._id || typeof document._id.toHexString !== 'function') return null;
  const location = resolveActivityLocation(buildings, document.location);
  if (!location || (query.buildingKey && query.buildingKey !== location.buildingKey)
    || (query.floorKey && query.floorKey !== location.floorKey)
    || (query.poiKey && query.poiKey !== location.poiKey)) return null;
  let series: ActivityDto['series'];
  if (document.seriesId !== undefined) {
    if (!document.seriesId || typeof document.seriesId.toHexString !== 'function'
      || !Number.isInteger(document.occurrenceIndex) || !Number.isInteger(document.occurrenceCount)
      || document.occurrenceIndex! < 1 || document.occurrenceCount! < document.occurrenceIndex!
      || document.occurrenceCount! > 200 || !(document.originalStartAt instanceof Date)
      || !Number.isFinite(document.originalStartAt.getTime())) return null;
    series = { id: document.seriesId.toHexString(), index: document.occurrenceIndex!, total: document.occurrenceCount! };
  }
  return { id: document._id.toHexString(), campusId: document.campusId,
    title: document.title, description: document.description,
    type: document.type as ActivityDto['type'], status: 'ACTIVE',
    startAt: document.startAt.toISOString(), endAt: document.endAt.toISOString(), location, ...(series ? { series } : {}) };
}
