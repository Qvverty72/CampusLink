import { createHash } from 'node:crypto';
import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { ApiError } from '../../services/apiError.js';
import type { ActivityInteractionDocument, ActivityInteractionType } from './activities.types.js';

export const ACTIVITY_INTERACTION_TYPES = ['VIEWED', 'JOINED', 'LEFT'] as const;
/** Deriva un ObjectId estable de la clave; el índice único de `_id` hace idempotente cada evento. */
export function activityInteractionId(eventKey: string): ObjectId {
  // La identidad estable del evento usa el índice único integrado como barrera de idempotencia.
  return new ObjectId(createHash('sha256').update(eventKey).digest('hex').slice(0, 24));
}
export function activityInteractionKey(activityId: ObjectId, campusId: string, userId: string,
  type: ActivityInteractionType, count: number, operationId?: string): string {
  return operationId ? `request:${campusId}:${userId}:${operationId}` : `transition:${activityId.toHexString()}:${userId}:${type}:${count}`;
}
/** Comprueba que una clave idempotente conserve actividad, campus, actor y tipo originales. */
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
/** Solo agrega eventos; el historial no se actualiza ni se elimina. */
export async function appendActivityInteraction(db: Db, event: Omit<ActivityInteractionDocument, '_id'>,
  session?: ClientSession): Promise<void> {
  if (!ACTIVITY_INTERACTION_TYPES.includes(event.type) || !(event.occurredAt instanceof Date)
    || !Number.isFinite(event.occurredAt.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'Interacción inválida.');
  await db.collection<ActivityInteractionDocument>('activity_interactions').insertOne(
    { _id: activityInteractionId(event.eventKey), ...event }, { session });
}
