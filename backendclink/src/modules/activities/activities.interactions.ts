import { createHash } from 'node:crypto';
import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { ApiError } from '../../services/apiError.js';
import type { ActivityInteractionDocument, ActivityInteractionType } from './activities.types.js';

export const ACTIVITY_INTERACTION_TYPES = ['VIEWED', 'JOINED', 'LEFT'] as const;
export function activityInteractionId(eventKey: string): ObjectId {
  // Stable event identity makes the built-in unique _id index an idempotency guard.
  return new ObjectId(createHash('sha256').update(eventKey).digest('hex').slice(0, 24));
}
export function activityInteractionKey(activityId: ObjectId, campusId: string, userId: string,
  type: ActivityInteractionType, count: number, operationId?: string): string {
  return operationId ? `request:${campusId}:${userId}:${operationId}` : `transition:${activityId.toHexString()}:${userId}:${type}:${count}`;
}
export async function hasActivityInteraction(db: Db, eventKey: string, activityId: ObjectId, campusId: string,
  userId: string, type: ActivityInteractionType, session?: ClientSession): Promise<boolean> {
  const event = await db.collection<ActivityInteractionDocument>('activity_interactions').findOne({ _id: activityInteractionId(eventKey) }, { session });
  if (!event) return false;
  if (event.eventKey !== eventKey || event.activityId.toHexString() !== activityId.toHexString()
    || event.campusId !== campusId || event.userId !== userId || event.type !== type) {
    throw new ApiError(409, 'CONFLICT', 'El identificador de interacción ya corresponde a otra acción.');
  }
  return true;
}
/** Only append operations are exposed. Never update or delete event history. */
export async function appendActivityInteraction(db: Db, event: Omit<ActivityInteractionDocument, '_id'>,
  session?: ClientSession): Promise<void> {
  if (!ACTIVITY_INTERACTION_TYPES.includes(event.type) || !(event.occurredAt instanceof Date)
    || !Number.isFinite(event.occurredAt.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'Interacción inválida.');
  await db.collection<ActivityInteractionDocument>('activity_interactions').insertOne(
    { _id: activityInteractionId(event.eventKey), ...event }, { session });
}
