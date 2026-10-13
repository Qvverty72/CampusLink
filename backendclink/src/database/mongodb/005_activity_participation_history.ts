import type { Db, MongoClient } from 'mongodb';
import type { ActivityDocument, ActivityParticipationDocument } from '../../modules/activities/activities.types.js';
import { appendActivityInteraction, hasActivityInteraction } from '../../modules/activities/activities.interactions.js';
import { initialActivityParticipation } from '../../modules/activities/activities.participation.js';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const uuid = new RegExp(uuidPattern);
const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

export function legacyParticipationHistory(row: ActivityParticipationDocument, creatorAt?: Date) {
  if (!row.activityId?.toHexString?.() || !uuid.test(row.userId) || !uuid.test(row.campusId)
    || !['JOINED', 'LEFT'].includes(row.status) || !validDate(row.joinedAt) || !validDate(row.updatedAt)
    || row.updatedAt < row.joinedAt || (creatorAt && (!validDate(creatorAt) || creatorAt > row.joinedAt))) {
    throw new Error('Legacy participation has invalid identity or chronology; review before migrating.');
  }
  return { firstJoinedAt: creatorAt ?? null, lastJoinedAt: row.joinedAt,
    lastLeftAt: row.status === 'LEFT' ? row.updatedAt : null,
    joinCount: 1, leaveCount: row.status === 'LEFT' ? 1 : 0, historyComplete: false };
}

/** Run with the API stopped. Preserve existing IDs and append only retained historical facts. */
export async function migrateActivityParticipationHistory(db: Db, client: MongoClient) {
  for (const name of ['activities', 'activity_participation', 'activity_interactions']) {
    if (!(await db.listCollections({ name }, { nameOnly: true }).toArray()).length) throw new Error(`Approved collection ${name} is required.`);
  }
  const activities = await db.collection<ActivityDocument>('activities').find({}).toArray();
  const byId = new Map(activities.map(activity => [activity._id.toHexString(), activity]));
  const rows = await db.collection<ActivityParticipationDocument>('activity_participation').find({}).toArray();
  // Validate the entire legacy input before any schema or data changes.
  for (const row of rows) if (row.joinCount === undefined) {
    const activity = byId.get(row.activityId.toHexString());
    if (activity && activity.campusId !== row.campusId) throw new Error('Participation belongs to a different campus from its activity.');
    legacyParticipationHistory(row, activity?.createdByUserId === row.userId ? activity.createdAt : undefined);
  }
  for (const activity of activities) if (!uuid.test(activity.campusId) || !uuid.test(activity.createdByUserId) || !validDate(activity.createdAt)) {
    throw new Error('Activity creator identity/date is invalid; review before migrating.');
  }
  const participations = db.collection<ActivityParticipationDocument>('activity_participation');
  await participations.createIndex({ activityId: 1, userId: 1 }, { unique: true, name: 'activity_user_uq' });
  await participations.createIndex({ campusId: 1, activityId: 1, status: 1 }, { name: 'participation_activity_status' });
  const interactions = db.collection('activity_interactions');
  await interactions.createIndex({ eventKey: 1 }, { name: 'activity_interaction_event_uq', unique: true });
  await interactions.createIndex({ campusId: 1, occurredAt: 1, type: 1 }, { name: 'activity_interaction_metrics' });
  await interactions.createIndex({ activityId: 1, userId: 1, occurredAt: 1 }, { name: 'activity_interaction_user_history' });
  await db.command({ collMod: 'activity_interactions', validator: { $jsonSchema: { bsonType: 'object',
    required: ['_id', 'activityId', 'campusId', 'userId', 'type', 'occurredAt', 'eventKey', 'provenance'], properties: {
      _id: { bsonType: 'objectId' }, activityId: { bsonType: 'objectId' },
      campusId: { bsonType: 'string', pattern: uuidPattern }, userId: { bsonType: 'string', pattern: uuidPattern },
      type: { enum: ['VIEWED', 'JOINED', 'LEFT'] }, occurredAt: { bsonType: 'date' },
      eventKey: { bsonType: 'string', minLength: 1 }, provenance: { enum: ['LIVE', 'LEGACY_STATE'] },
    } } }, validationLevel: 'strict', validationAction: 'error' });
  let migrated = 0, materialized = 0;
  for (const old of rows) {
    const changed = await client.withSession(session => session.withTransaction(async () => {
    const row = await participations.findOne({ _id: old._id }, { session });
    if (!row || row.joinCount !== undefined) return false;
    const activity = byId.get(row.activityId.toHexString());
    const history = legacyParticipationHistory(row, activity?.createdByUserId === row.userId ? activity.createdAt : undefined);
    await participations.updateOne({ _id: row._id }, { $set: history }, { session });
    for (const type of ['JOINED', ...(row.status === 'LEFT' ? ['LEFT'] : [])] as ('JOINED' | 'LEFT')[]) {
      const eventKey = `legacy:${row._id!.toHexString()}:${type}`;
      if (!await hasActivityInteraction(db, eventKey, row.activityId, row.campusId, row.userId, type, session)) {
        await appendActivityInteraction(db, { activityId: row.activityId, campusId: row.campusId, userId: row.userId, type,
          occurredAt: type === 'JOINED' ? row.joinedAt : row.updatedAt, eventKey, provenance: 'LEGACY_STATE' }, session);
      }
    }
    return true;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
    if (changed) migrated++;
  }
  for (const activity of activities) {
    const changed = await client.withSession(session => session.withTransaction(async () => {
    const key = { activityId: activity._id, userId: activity.createdByUserId, campusId: activity.campusId };
    if (await participations.findOne(key, { session })) return false;
    const initial = { ...initialActivityParticipation(activity._id, activity.campusId, activity.createdByUserId, activity.createdAt), historyComplete: false };
    await participations.updateOne(key, { $setOnInsert: initial }, { session, upsert: true });
    const eventKey = `legacy:creator:${activity._id.toHexString()}`;
    if (!await hasActivityInteraction(db, eventKey, activity._id, activity.campusId, activity.createdByUserId, 'JOINED', session)) {
      await appendActivityInteraction(db, { ...key, type: 'JOINED', occurredAt: activity.createdAt, eventKey, provenance: 'LEGACY_STATE' }, session);
    }
    return true;
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
    if (changed) materialized++;
  }
  await db.command({ collMod: 'activity_participation', validator: { $jsonSchema: { bsonType: 'object',
    required: ['activityId', 'campusId', 'userId', 'status', 'joinedAt', 'updatedAt', 'firstJoinedAt', 'lastJoinedAt', 'lastLeftAt', 'joinCount', 'leaveCount', 'historyComplete'],
    properties: { activityId: { bsonType: 'objectId' }, campusId: { bsonType: 'string', pattern: uuidPattern },
      userId: { bsonType: 'string', pattern: uuidPattern }, status: { enum: ['JOINED', 'LEFT'] }, joinedAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' }, firstJoinedAt: { bsonType: ['date', 'null'] }, lastJoinedAt: { bsonType: 'date' },
      lastLeftAt: { bsonType: ['date', 'null'] }, joinCount: { bsonType: ['int', 'long'], minimum: 1 },
      leaveCount: { bsonType: ['int', 'long'], minimum: 0 }, historyComplete: { bsonType: 'bool' },
    } } }, validationLevel: 'strict', validationAction: 'error' });
  return { migrated, materialized };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/005_activity_participation_history.js')) {
  void (async () => {
    const { getMongoDb } = await import('../../config/mongodb.js');
    const { mongoClient, closeMongoDB } = await import('../../database/mongodb/client.js');
    try { console.log(JSON.stringify(await migrateActivityParticipationHistory(getMongoDb(), mongoClient))); }
    catch { console.error('Participation migration failed; inspect state before restarting writers.'); process.exitCode = 1; }
    finally { await closeMongoDB(); }
  })();
}
