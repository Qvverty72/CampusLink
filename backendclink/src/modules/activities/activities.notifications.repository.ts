import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';
import type { ActivityNotificationEvent } from './activities.notifications.js';
import { occurrencePublicationNotification } from './activities.notifications.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { spatialBuildings } from './activities.location.js';
import { toVisibleActivity } from './activities.policy.js';

export interface PendingActivityNotification {
  activityId: string;
  campusId: string;
  event: ActivityNotificationEvent;
  creatorId: string;
  createdAt: Date;
}

/** Encola el aviso al inicio real de cada ocurrencia, sin depender de cuál representa a la serie en el listado. */
export async function enqueuePublishedOfficialOccurrences(now = new Date()): Promise<void> {
  const db = getMongoDb();
  const activities = db.collection<ActivityDocument>('activities');
  const documents = await activities.find({ type: 'OFFICIAL_EVENT', status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null,
    seriesId: { $type: 'objectId' }, startAt: { $lte: now }, endAt: { $gt: now },
  }).toArray();
  const maps = new Map<string, CampusMapDocument | null>();
  for (const document of documents) {
    if (document.type !== 'OFFICIAL_EVENT' || !document.seriesId
      || !(document.startAt instanceof Date) || document.startAt > now) continue;
    if (!maps.has(document.campusId)) maps.set(document.campusId,
      await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId: document.campusId, status: 'ACTIVE' }));
    const map = maps.get(document.campusId);
    if (!map || map.campusId !== document.campusId || map.status !== 'ACTIVE'
      || !toVisibleActivity(document, document.campusId, now, spatialBuildings(map))) continue;
    const event = occurrencePublicationNotification(document);
    // Un aviso PUBLICADO antiguo entregado antes de tiempo no reemplaza el aviso de inicio requerido.
    // Un aviso antiguo pendiente se difiere y se usa luego como el aviso de inicio de esta ocurrencia.
    const announced = { $or: [
      { key: event.key }, { type: 'OFFICIAL_EVENT_STARTED' },
      { type: 'OFFICIAL_EVENT_PUBLISHED', status: 'PENDING' },
      { type: 'OFFICIAL_EVENT_PUBLISHED', occurredAt: { $gte: document.startAt } },
      { type: 'OFFICIAL_EVENT_PUBLISHED', deliveredAt: { $gte: document.startAt } },
    ] };
    if (document.notificationEvents?.some(previous => previous.key === event.key || previous.type === 'OFFICIAL_EVENT_STARTED'
      || (previous.type === 'OFFICIAL_EVENT_PUBLISHED' && (previous.status === 'PENDING'
        || previous.occurredAt >= document.startAt || (previous.deliveredAt && previous.deliveredAt >= document.startAt))))) continue;
    // Las fechas exactas protegen frente a ediciones concurrentes; el push condicional coordina workers y reinicios.
    await activities.updateOne({ _id: document._id, campusId: document.campusId, type: 'OFFICIAL_EVENT',
      status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null, seriesId: document.seriesId,
      startAt: document.startAt, endAt: document.endAt,
      notificationEvents: { $not: { $elemMatch: announced } } },
    { $push: { notificationEvents: event } });
  }
}

export async function findPendingActivityNotifications(now = new Date()): Promise<PendingActivityNotification[]> {
  const documents = await getMongoDb().collection<ActivityDocument>('activities')
    .find({ 'notificationEvents.status': 'PENDING', $or: [
      { seriesId: { $not: { $type: 'objectId' } } }, { startAt: { $lte: now } },
      { notificationEvents: { $elemMatch: { status: 'PENDING', type: { $ne: 'OFFICIAL_EVENT_PUBLISHED' } } } },
    ] }, { projection: { _id: 1, campusId: 1,
      notificationEvents: 1, createdByUserId: 1, createdAt: 1, seriesId: 1, startAt: 1 } }).sort({ createdAt: 1, _id: 1 }).limit(25).toArray();
  return documents.flatMap(document => (document.notificationEvents ?? []).filter(event => event.status === 'PENDING'
    && !(document.seriesId && event.type === 'OFFICIAL_EVENT_PUBLISHED' && document.startAt > now))
    .map(event => ({ activityId: document._id.toHexString(), campusId: document.campusId,
      event: document.seriesId && event.type === 'OFFICIAL_EVENT_PUBLISHED' && event.occurredAt < document.startAt
        ? { ...event, occurredAt: document.startAt } : event,
      creatorId: document.createdByUserId, createdAt: document.createdAt }))).slice(0, 100);
}

export async function findNotificationParticipants(task: PendingActivityNotification): Promise<string[]> {
  if (task.event.recipientIds) return task.event.recipientIds;
  const rows = await getMongoDb().collection<ActivityParticipationDocument>('activity_participation')
    .find({ campusId: task.campusId, activityId: new ObjectId(task.activityId) },
      { projection: { userId: 1, status: 1, joinedAt: 1 } }).toArray();
  const users = rows.filter(row => row.status === 'JOINED' && row.joinedAt instanceof Date
    && row.joinedAt <= task.event.occurredAt).map(row => row.userId);
  if (!rows.some(row => row.userId === task.creatorId) && task.createdAt <= task.event.occurredAt) users.push(task.creatorId);
  return [...new Set(users)];
}

export async function markNotificationDelivered(task: PendingActivityNotification): Promise<void> {
  await getMongoDb().collection<ActivityDocument>('activities').updateOne({ _id: new ObjectId(task.activityId),
    campusId: task.campusId, notificationEvents: { $elemMatch: { key: task.event.key, status: 'PENDING' } } },
  { $set: { 'notificationEvents.$.status': 'DELIVERED', 'notificationEvents.$.deliveredAt': new Date() } });
}
