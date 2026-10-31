import { ObjectId } from 'mongodb';
import { getMongoDB as getMongoDb } from '../../database/mongodb/client.js';
import { mongoClient } from '../../database/mongodb/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity, visibleActivityFilter } from './activities.policy.js';
import { requireParticipationIndex } from './activities.participation-index.js';
import { publicationNotifications } from './activities.notifications.js';
import { initialActivityParticipation } from './activities.participation.js';
import { appendActivityInteraction, activityInteractionKey } from './activities.interactions.js';
import type { ActivityDocument, ActivityDto, ActivityParticipationDocument, ActivitySeriesDocument } from './activities.types.js';

/** Inserta plantilla, ocurrencias, participación inicial e interacciones en una sola transacción. */
export async function insertActivitySeries(series: ActivitySeriesDocument, documents: ActivityDocument[]): Promise<ActivityDto[]> {
  const db = getMongoDb(); await requireParticipationIndex(db);
  const indexes = await db.collection('activities').indexes();
  if (!indexes.some(index => index.unique && index.key.seriesId === 1 && index.key.occurrenceIndex === 1
    && Object.keys(index.key).length === 2 && JSON.stringify(index.partialFilterExpression) === JSON.stringify({ seriesId: { $type: 'objectId' } })
    && !index.sparse)) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El índice de ocurrencias no está configurado.');
  const result = await mongoClient.withSession(session => session.withTransaction(async () => {
    // El `insertMany` del driver 7.6 vuelve a pasar un timeout por operación heredado.
    // Este handle conserva pool, base y opciones; la sesión controla el plazo de la transacción.
    const transactionDb = mongoClient.db(db.databaseName, { ...db.options, timeoutMS: undefined });
    const now = new Date(Math.max(series.createdAt.getTime(), Date.now()));
    const map = await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId: series.campusId, status: 'ACTIVE' }, { session });
    const occurrences = documents.map(document => map && toVisibleActivity(document, series.campusId, now, spatialBuildings(map)));
    if (!documents.length || occurrences.some(value => !value)) throw new ApiError(400, 'VALIDATION_ERROR', 'Las fechas o la ubicación ya no están disponibles. Revisa la vista previa.');
    if (documents.filter(document => document.occurrenceIndex === 1).length !== 1) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'La primera ocurrencia no está disponible.');
    await transactionDb.collection<ActivityDocument>('activities').insertMany(documents.map(document => ({ ...document, createdAt: now, updatedAt: now,
      notificationEvents: publicationNotifications(document, now),
      ...(document.occurrenceIndex === 1 ? { seriesDefinition: { ...series, createdAt: now, updatedAt: now } } : {}) })), { session });
    await transactionDb.collection<ActivityParticipationDocument>('activity_participation').insertMany(documents.map(document =>
      initialActivityParticipation(document._id, series.campusId, series.createdByUserId, now)), { session });
    for (const document of documents) await appendActivityInteraction(transactionDb, {
      activityId: document._id, campusId: series.campusId, userId: series.createdByUserId, type: 'JOINED', occurredAt: now,
      provenance: 'LIVE', eventKey: activityInteractionKey(document._id, series.campusId, series.createdByUserId, 'JOINED', 1),
    }, session);
    return occurrences as ActivityDto[];
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, timeoutMS: 60_000 }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar la publicación de la serie.');
  return result;
}

export async function findActivitySeries(campusId: string, seriesId: string): Promise<ActivitySeriesDocument | null> {
  const id = new ObjectId(seriesId);
  return (await getMongoDb().collection<ActivityDocument>('activities').findOne({ campusId, seriesId: id,
    'seriesDefinition._id': id, 'seriesDefinition.status': 'ACTIVE', 'seriesDefinition.visibility': 'PUBLIC' }))?.seriesDefinition ?? null;
}
/** Busca únicamente las ocurrencias que siguen visibles según la misma política del listado. */
export const findActivitySeriesOccurrences = (campusId: string, seriesId: string, now: Date) => getMongoDb().collection<ActivityDocument>('activities')
  .find({ ...visibleActivityFilter(campusId, now), seriesId: new ObjectId(seriesId) }).sort({ startAt: 1, _id: 1 }).toArray();
