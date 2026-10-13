import { MongoServerError, ObjectId } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import { mongoClient } from '../../database/mongodb/client.js';
import { createServerSupabaseClient } from '../../database/supabase/client.js';
import { ApiError } from '../../services/apiError.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity, visibleActivityFilter } from './activities.policy.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';
import { requireParticipationIndex } from './activities.participation-index.js';
import { participationDto } from './activities.participation.js';
import type { ActivityCreatorRecord, ActivityParticipationDto } from './activities.types.js';
import { appendActivityInteraction, activityInteractionKey, hasActivityInteraction } from './activities.interactions.js';

function requireParticipationCounters(current: ActivityParticipationDocument): void {
  if (!Number.isSafeInteger(current.joinCount) || current.joinCount! < 1 || current.joinCount! >= Number.MAX_SAFE_INTEGER
    || !Number.isSafeInteger(current.leaveCount) || current.leaveCount! < 0 || current.leaveCount! > current.joinCount!
    || !(current.lastJoinedAt instanceof Date) || !Number.isFinite(current.lastJoinedAt.getTime())) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El historial de participación requiere una migración válida.');
  }
}

export function findVisibleActivity(campusId: string, activityId: string, now: Date): Promise<ActivityDocument | null> {
  return getMongoDb().collection<ActivityDocument>('activities')
    .findOne({ ...visibleActivityFilter(campusId, now), _id: new ObjectId(activityId) });
}

export function findOwnParticipation(campusId: string, activityId: string, userId: string): Promise<ActivityParticipationDocument | null> {
  return getMongoDb().collection<ActivityParticipationDocument>('activity_participation')
    .findOne({ campusId, activityId: new ObjectId(activityId), userId });
}

export function findCreatedActivity(campusId: string, activityId: string, userId: string): Promise<ActivityCreatorRecord | null> {
  return getMongoDb().collection<ActivityCreatorRecord>('activities').findOne(
    { campusId, _id: new ObjectId(activityId), createdByUserId: userId },
    { projection: { _id: 1, campusId: 1, createdByUserId: 1, createdAt: 1 } });
}

export async function findActivityOrganizer(userId: string): Promise<{ name: string } | null> {
  const { data, error } = await createServerSupabaseClient().from('perfil_usuario')
    .select('nombre_completo').eq('id', userId).is('deleted_at', null)
    .maybeSingle<{ nombre_completo: string }>();
  if (error) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity organizer lookup unavailable.');
  return data?.nombre_completo?.trim() ? { name: data.nombre_completo.trim() } : null;
}

/** Participation and its counter commit together; the unique index prevents duplicate users. */
export async function registerActivityParticipation(campusId: string, activityId: string, userId: string, now: Date, operationId?: string): Promise<void> {
  const db = getMongoDb();
  const participations = db.collection<ActivityParticipationDocument>('activity_participation');
  await requireParticipationIndex(db);
  const _id = new ObjectId(activityId);
  const register = () => mongoClient.withSession(session => session.withTransaction(async () => {
    const transactionNow = new Date(Math.max(now.getTime(), Date.now()));
    const activities = db.collection<ActivityDocument>('activities');
    const activity = await activities.findOne({ ...visibleActivityFilter(campusId, transactionNow), _id }, { session });
    const map = await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId, status: 'ACTIVE' }, { session });
    // A location may have been disabled since the detail was read; check the transaction snapshot too.
    if (!activity || !map || !toVisibleActivity(activity, campusId, transactionNow, spatialBuildings(map))) {
      throw new ApiError(404, 'NOT_FOUND', 'Activity not available.');
    }
    const key = { campusId, activityId: _id, userId };
    if (operationId && await hasActivityInteraction(db, activityInteractionKey(_id, campusId, userId, 'JOINED', 0, operationId),
      _id, campusId, userId, 'JOINED', session)) return;
    const current = await participations.findOne(key, { session });
    if (current && !['JOINED', 'LEFT'].includes(current.status)) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participation data is invalid.');
    }
    if (current?.status === 'JOINED' || (!current && activity.createdByUserId === userId)) return;
    if (current) requireParticipationCounters(current);
    if (!Number.isSafeInteger(activity.participantCount) || activity.participantCount < 0
      || activity.participantCount === Number.MAX_SAFE_INTEGER) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participant count is invalid.');
    }
    await participations.updateOne(key, {
      $set: { status: 'JOINED', joinedAt: transactionNow, lastJoinedAt: transactionNow, updatedAt: transactionNow },
      $inc: { joinCount: 1 },
      $setOnInsert: { activityId: _id, userId, campusId, firstJoinedAt: transactionNow,
        lastLeftAt: null, leaveCount: 0, historyComplete: true },
    }, { session, upsert: true });
    // Writing the activity also serializes competing registrations in the transaction.
    const updated = await activities.updateOne({ _id, campusId }, { $inc: { participantCount: 1 }, $set: { updatedAt: transactionNow } }, { session });
    if (updated.matchedCount !== 1) throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    await appendActivityInteraction(db, { activityId: _id, campusId, userId, type: 'JOINED', occurredAt: transactionNow, provenance: 'LIVE',
      eventKey: activityInteractionKey(_id, campusId, userId, 'JOINED', (current?.joinCount ?? 0) + 1, operationId) }, session);
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  try { await register(); }
  catch (error) {
    // A competing upsert can finish first. The aborted transaction must not increment again.
    if (error instanceof MongoServerError && error.code === 11000) {
      if (operationId && await hasActivityInteraction(db, activityInteractionKey(_id, campusId, userId, 'JOINED', 0, operationId),
        _id, campusId, userId, 'JOINED')) return;
      const current = await findOwnParticipation(campusId, activityId, userId);
      if (current?.status === 'JOINED') return;
      throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    }
    throw error;
  }
}

/** Leaving retains the row and its last joinedAt; repeat requests never decrement twice. */
export async function withdrawActivityParticipation(campusId: string, activityId: string,
  userId: string, now: Date, operationId?: string): Promise<ActivityParticipationDto> {
  const db = getMongoDb();
  await requireParticipationIndex(db);
  const activities = db.collection<ActivityDocument>('activities');
  const participations = db.collection<ActivityParticipationDocument>('activity_participation');
  const _id = new ObjectId(activityId);
  const key = { campusId, activityId: _id, userId };
  const withdraw = () => mongoClient.withSession(session => session.withTransaction(async () => {
    const transactionNow = new Date(Math.max(now.getTime(), Date.now()));
    const current = await participations.findOne(key, { session });
    const activity = await activities.findOne({ _id, campusId }, { session });
    if (activity?.createdByUserId === userId) {
      throw new ApiError(403, 'FORBIDDEN', 'No puedes retirarte de una actividad que creaste.');
    }
    if (operationId && await hasActivityInteraction(db, activityInteractionKey(_id, campusId, userId, 'LEFT', 0, operationId),
      _id, campusId, userId, 'LEFT', session)) {
      return current ? participationDto(current, campusId, activityId, userId)
        : { campusId, activityId, status: 'NOT_JOINED' as const, canLeave: false };
    }
    const ownState = current && participationDto(current, campusId, activityId, userId);
    if (ownState?.status === 'LEFT') return ownState;
    // Withdrawal is also available after expiry or hiding; it exposes no activity content.
    if (!current) {
      return { campusId, activityId, status: 'NOT_JOINED' as const, canLeave: false };
    }
    if (!activity || !Number.isSafeInteger(activity.participantCount) || activity.participantCount < 1) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participant count is invalid.');
    }
    requireParticipationCounters(current);
    const joinedAt = current?.joinedAt ?? activity.createdAt;
    const left = participationDto({ ...key, status: 'LEFT', joinedAt, updatedAt: transactionNow }, campusId, activityId, userId);
    await participations.updateOne(key, {
      $set: { status: 'LEFT', lastLeftAt: transactionNow, updatedAt: transactionNow },
      $inc: { leaveCount: 1 },
      $setOnInsert: { ...key, joinedAt },
    }, { session, upsert: true });
    // The shared activity write serializes joins and leaves, including different users.
    const update = await activities.updateOne({ _id, campusId, participantCount: { $gte: 1 } },
      { $inc: { participantCount: -1 }, $set: { updatedAt: transactionNow } }, { session });
    if (update.matchedCount !== 1) throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    await appendActivityInteraction(db, { activityId: _id, campusId, userId, type: 'LEFT', occurredAt: transactionNow, provenance: 'LIVE',
      eventKey: activityInteractionKey(_id, campusId, userId, 'LEFT', current.leaveCount! + 1, operationId) }, session);
    return left;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  try {
    const result = await withdraw();
    if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity withdrawal was not confirmed.');
    return result;
  } catch (error) {
    // Concurrent participation writes may collide instead of being retried by MongoDB.
    if (error instanceof MongoServerError && error.code === 11000) {
      const current = await findOwnParticipation(campusId, activityId, userId);
      if (operationId && await hasActivityInteraction(db, activityInteractionKey(_id, campusId, userId, 'LEFT', 0, operationId),
        _id, campusId, userId, 'LEFT')) {
        return current ? participationDto(current, campusId, activityId, userId)
          : { campusId, activityId, status: 'NOT_JOINED' as const, canLeave: false };
      }
      if (current?.status === 'LEFT') return participationDto(current, campusId, activityId, userId);
      throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    }
    throw error;
  }
}
