import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';
import type { ActivityNotificationEvent } from './activities.notifications.js';

export interface PendingActivityNotification {
  activityId: string;
  campusId: string;
  event: ActivityNotificationEvent;
  creatorId: string;
  createdAt: Date;
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
