import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';
import type { ActivityNotificationEvent } from './activities.notifications.js';
import { startedNotification } from './activities.notifications.js';
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

/** Server-side start detection, including existing series; never replay fully ended dates. */
export async function enqueueStartedOfficialOccurrences(now = new Date()): Promise<void> {
  const db = getMongoDb();
  const activities = db.collection<ActivityDocument>('activities');
  const documents = await activities.find({ type: 'OFFICIAL_EVENT', status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null,
    seriesId: { $type: 'objectId' }, startAt: { $lte: now }, endAt: { $gt: now },
    $expr: { $gt: ['$startAt', '$createdAt'] },
    notificationEvents: { $not: { $elemMatch: { type: 'OFFICIAL_EVENT_STARTED' } } },
  }).toArray();
  const maps = new Map<string, CampusMapDocument | null>();
  for (const document of documents) {
    if (document.type !== 'OFFICIAL_EVENT' || !document.seriesId || !(document.createdAt instanceof Date)
      || !(document.startAt instanceof Date) || document.startAt > now || document.startAt <= document.createdAt) continue;
    if (!maps.has(document.campusId)) maps.set(document.campusId,
      await db.collection<CampusMapDocument>('campus_maps').findOne({ campusId: document.campusId, status: 'ACTIVE' }));
    const map = maps.get(document.campusId);
    if (!map || map.campusId !== document.campusId || map.status !== 'ACTIVE'
      || !toVisibleActivity(document, document.campusId, now, spatialBuildings(map))) continue;
    const event = startedNotification(document);
    // Exact dates protect against a concurrent edit; a conditional push protects concurrent workers/restarts.
    await activities.updateOne({ _id: document._id, campusId: document.campusId, type: 'OFFICIAL_EVENT',
      status: 'ACTIVE', visibility: 'PUBLIC', deletedAt: null, seriesId: document.seriesId,
      startAt: document.startAt, endAt: document.endAt, 'notificationEvents.key': { $ne: event.key } },
    { $push: { notificationEvents: event } });
  }
}

export async function findPendingActivityNotifications(): Promise<PendingActivityNotification[]> {
  const documents = await getMongoDb().collection<ActivityDocument>('activities')
    .find({ 'notificationEvents.status': 'PENDING' }, { projection: { _id: 1, campusId: 1,
      notificationEvents: 1, createdByUserId: 1, createdAt: 1 } }).sort({ createdAt: 1, _id: 1 }).limit(25).toArray();
  return documents.flatMap(document => (document.notificationEvents ?? []).filter(event => event.status === 'PENDING')
    .map(event => ({ activityId: document._id.toHexString(), campusId: document.campusId, event,
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
