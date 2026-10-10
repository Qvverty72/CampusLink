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
export async function registerActivityParticipation(campusId: string, activityId: string, userId: string, now: Date): Promise<void> {
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
    const current = await participations.findOne(key, { session });
    if (current && !['JOINED', 'LEFT'].includes(current.status)) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participation data is invalid.');
    }
    if (current?.status === 'JOINED' || (!current && activity.createdByUserId === userId)) return;
    if (!Number.isSafeInteger(activity.participantCount) || activity.participantCount < 0
      || activity.participantCount === Number.MAX_SAFE_INTEGER) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participant count is invalid.');
    }
    await participations.updateOne(key, {
      $set: { status: 'JOINED', joinedAt: transactionNow, updatedAt: transactionNow },
      $setOnInsert: { activityId: _id, userId, campusId },
    }, { session, upsert: true });
    // Writing the activity also serializes competing registrations in the transaction.
    await activities.updateOne({ _id, campusId }, { $inc: { participantCount: 1 }, $set: { updatedAt: transactionNow } }, { session });
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  try { await register(); }
  catch (error) {
    // A competing upsert can finish first. The aborted transaction must not increment again.
    if (error instanceof MongoServerError && error.code === 11000) {
      const current = await findOwnParticipation(campusId, activityId, userId);
      if (current?.status === 'JOINED') return;
      throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    }
    throw error;
  }
}

/** Leaving retains the row and its last joinedAt; repeat requests never decrement twice. */
export async function withdrawActivityParticipation(campusId: string, activityId: string,
  userId: string, now: Date): Promise<ActivityParticipationDto> {
  const db = getMongoDb();
  await requireParticipationIndex(db);
  const activities = db.collection<ActivityDocument>('activities');
  const participations = db.collection<ActivityParticipationDocument>('activity_participation');
  const _id = new ObjectId(activityId);
  const key = { campusId, activityId: _id, userId };
  const withdraw = () => mongoClient.withSession(session => session.withTransaction(async () => {
    const transactionNow = new Date(Math.max(now.getTime(), Date.now()));
    const current = await participations.findOne(key, { session });
    const ownState = current && participationDto(current, campusId, activityId, userId);
    if (ownState?.status === 'LEFT') return ownState;
    // Withdrawal is also available after expiry or hiding; it exposes no activity content.
    const activity = await activities.findOne({ _id, campusId }, { session });
    if (!current && activity?.createdByUserId !== userId) {
      return { campusId, activityId, status: 'NOT_JOINED' as const };
    }
    if (!activity || !Number.isSafeInteger(activity.participantCount) || activity.participantCount < 1) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity participant count is invalid.');
    }
    const joinedAt = current?.joinedAt ?? activity.createdAt;
    const left = participationDto({ ...key, status: 'LEFT', joinedAt, updatedAt: transactionNow }, campusId, activityId, userId);
    await participations.updateOne(key, {
      $set: { status: 'LEFT', updatedAt: transactionNow },
      $setOnInsert: { ...key, joinedAt },
    }, { session, upsert: true });
    // The shared activity write serializes joins and leaves, including different users.
    const update = await activities.updateOne({ _id, campusId, participantCount: { $gte: 1 } },
      { $inc: { participantCount: -1 }, $set: { updatedAt: transactionNow } }, { session });
    if (update.matchedCount !== 1) throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    return left;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  try {
    const result = await withdraw();
    if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity withdrawal was not confirmed.');
    return result;
  } catch (error) {
    // Concurrent legacy-creator upserts may collide instead of being retried by MongoDB.
    if (error instanceof MongoServerError && error.code === 11000) {
      const current = await findOwnParticipation(campusId, activityId, userId);
      if (current?.status === 'LEFT') return participationDto(current, campusId, activityId, userId);
      throw new ApiError(409, 'CONFLICT', 'Activity participation changed. Retry the request.');
    }
    throw error;
  }
}
