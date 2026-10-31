import { ObjectId } from 'mongodb';
import { getMongoDB as getMongoDb } from '../../database/mongodb/client.js';
import { mongoClient } from '../../database/mongodb/client.js';
import { createServerSupabaseClient } from '../../database/supabase/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { requireResourceOwner } from '../auth/auth.authorization.js';
import { getAvailableActivity } from './activities.detail.service.js';
import { visibleActivityFilter, toVisibleActivity } from './activities.policy.js';
import { spatialBuildings } from './activities.location.js';
import type { ActivityChangeDocument } from './activities.edit.types.js';
import type { ActivityDocument, ActivityParticipationDocument, ActivityParticipantsQuery, ActivityParticipantsRecords, ActivityDeletionResult } from './activities.types.js';

/** Ocultamiento idempotente: conserva estado temporal, datos, historial e inscripciones de la ocurrencia. */
export async function hideReportedActivity(campusId: string, activityId: string): Promise<void> {
  const activities = getMongoDb().collection<ActivityDocument>('activities');
  const key = { campusId, _id: new ObjectId(activityId) };
  const changed = await activities.findOneAndUpdate({ ...key, visibility: 'PUBLIC', deletedAt: null },
    { $set: { visibility: 'HIDDEN', updatedAt: new Date() }, $inc: { editRevision: 1 } }, { returnDocument: 'after' });
  if (changed) return;
  const current = await activities.findOne(key);
  if (!current) throw new ApiError(409, 'CONFLICT', 'La actividad vinculada ya no está disponible.');
  if (current.visibility !== 'HIDDEN' && !current.deletedAt) throw new ApiError(409, 'CONFLICT', 'No se pudo ocultar la actividad en su estado actual.');
}

/** Una instantánea mantiene total, creador legado y página coherentes durante altas y bajas. */
export async function findActivityParticipants(document: ActivityDocument, query: ActivityParticipantsQuery,
  currentUserId: string): Promise<ActivityParticipantsRecords> {
  const db = getMongoDb();
  const rows = db.collection<ActivityParticipationDocument>('activity_participation');
  const result = await mongoClient.withSession(session => session.withTransaction(async () => {
    const at = new Date();
    const current = await db.collection<ActivityDocument>('activities').findOne({ ...visibleActivityFilter(document.campusId, at), _id: document._id }, { session });
    const map = await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId: document.campusId, status: 'ACTIVE' }, { session });
    if (!current || !map || !toVisibleActivity(current, document.campusId, at, spatialBuildings(map))) {
      throw new ApiError(404, 'NOT_FOUND', 'Activity not available.');
    }
    const filter = { campusId: document.campusId, activityId: document._id, status: 'JOINED' as const };
    const creator = await rows.findOne({ campusId: document.campusId, activityId: document._id, userId: document.createdByUserId }, { session });
    // No volver a incluir al creador antiguo si existe una fila explícita con estado LEFT.
    const implicitCreator = !creator;
    const own = currentUserId === document.createdByUserId ? creator
      : await rows.findOne({ ...filter, userId: currentUserId }, { session });
    const ownJoined = own?.status === 'JOINED';
    // Ordena antes de paginar para que el usuario actual ocupe un solo lugar en la primera página.
    const prefix = ownJoined ? [{ key: own._id!.toHexString(), userId: currentUserId }] : [];
    if (implicitCreator) {
      const implicit = { key: 'creator', userId: document.createdByUserId };
      if (currentUserId === document.createdByUserId) prefix.unshift(implicit);
      else prefix.push(implicit);
    }
    const total = await rows.countDocuments(filter, { session }) + Number(implicitCreator);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const pageOffset = (page - 1) * query.pageSize;
    const first = prefix.slice(pageOffset, pageOffset + query.pageSize);
    const offset = Math.max(0, pageOffset - prefix.length);
    const limit = query.pageSize - first.length;
    const remainingFilter = ownJoined ? { ...filter, userId: { $ne: currentUserId } } : filter;
    const participants = limit ? await rows.find(remainingFilter, { session, projection: { _id: 1, userId: 1 } })
      .sort({ _id: 1 }).skip(offset).limit(limit).toArray() : [];
    return { page, pageSize: query.pageSize, total,
      rows: [...first,
        ...participants.map(row => ({ key: row._id!.toHexString(), userId: row.userId }))] };
  }, { readConcern: { level: 'snapshot' } }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Participant lookup unavailable.');
  return result;
}

export async function findParticipantNames(campusId: string, userIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await createServerSupabaseClient().from('perfil_usuario')
    .select('id,nombre_completo').eq('campus_id', campusId).is('deleted_at', null).in('id', userIds);
  if (error) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Participant names unavailable.');
  return new Map((data ?? []).map(row => [row.id, row.nombre_completo?.trim() || '']));
}

export async function commitActivityDeletion(auth: VerifiedAuthConnection, activityId: string,
  expectedRevision: number, now: Date): Promise<ActivityDeletionResult> {
  const db = getMongoDb();
  const result = await mongoClient.withSession(session => session.withTransaction(async () => {
    const transactionNow = new Date(Math.max(Date.now(), now.getTime()));
    const activities = db.collection<ActivityDocument>('activities');
    const { document } = await getAvailableActivity(auth, activityId, { now: () => transactionNow,
      getActiveMap: campusId => db.collection<CampusMapDocument>('campus_maps').findOne({ campusId, status: 'ACTIVE' }, { session }),
      findActivity: (campusId, id, at) => activities.findOne({ ...visibleActivityFilter(campusId, at), _id: new ObjectId(id) }, { session }),
    });
    requireResourceOwner(auth, document.createdByUserId);
    if ((document.editRevision ?? 0) !== expectedRevision) throw new ApiError(409, 'CONFLICT', 'La actividad cambió. Recarga la ficha antes de eliminar.');
    const before = { title: document.title, description: document.description, type: document.type,
      startAt: document.startAt, endAt: document.endAt, location: document.location, status: document.status };
    const history: ActivityChangeDocument = { _id: new ObjectId(), operationId: new ObjectId(), campusId: auth.campusId,
      activityId: document._id, ...(document.seriesId ? { seriesId: document.seriesId } : {}), actorUserId: auth.userId,
      revision: expectedRevision + 1, scope: 'ONE', changedAt: transactionNow, before,
      after: { ...before, status: 'DELETED', deletedAt: transactionNow }, changedFields: ['status', 'deletedAt'], notificationReasons: [] };
    const update = await activities.updateOne({ ...visibleActivityFilter(auth.campusId, transactionNow), _id: document._id,
      createdByUserId: auth.userId, ...(expectedRevision === 0 ? { $or: [{ editRevision: 0 }, { editRevision: { $exists: false } }] } : { editRevision: expectedRevision }) },
    { $set: { status: 'DELETED', deletedAt: transactionNow, deletedByUserId: auth.userId,
      updatedAt: transactionNow, editRevision: expectedRevision + 1 }, $push: { changeHistory: history } }, { session });
    if (update.matchedCount !== 1) throw new ApiError(409, 'CONFLICT', 'La actividad cambió. Recarga la ficha antes de eliminar.');
    return { activityId, campusId: auth.campusId, revision: expectedRevision + 1, deletedAt: transactionNow.toISOString() };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar la eliminación.');
  return result;
}
