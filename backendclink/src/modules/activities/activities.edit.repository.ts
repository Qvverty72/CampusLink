import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import { mongoClient } from '../../database/mongodb/client.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { ApiError } from '../../services/apiError.js';
import { accountCapabilities } from '../auth/auth.authorization.js';
import { activeCommunityActivityFilter, COMMUNITY_ACTIVITY_LIMIT_MESSAGE } from './activities.policy.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';
import type { ActivityChangeDocument, ActivityEditResult, EditActivityInput } from './activities.edit.types.js';
import { previewActivityEdit } from './activities.edit.service.js';
import { changeNotification, groupedChangeNotification, participantsAtChange } from './activities.notifications.js';

export const findEditableActivity = (campusId: string, activityId: string) => getMongoDb().collection<ActivityDocument>('activities')
  .findOne({ campusId, _id: new ObjectId(activityId), status: { $in: ['ACTIVE', 'FINISHED'] }, visibility: 'PUBLIC', deletedAt: null });
export const findEditOccurrences = (campusId: string, seriesId: string) => getMongoDb().collection<ActivityDocument>('activities')
  .find({ campusId, seriesId: new ObjectId(seriesId) }).sort({ occurrenceIndex: 1 }).toArray();

export async function commitActivityEdit(auth: VerifiedAuthConnection, activityId: string, input: EditActivityInput, now: Date): Promise<ActivityEditResult> {
  const db = getMongoDb();
  const operationId = new ObjectId();
  const result = await mongoClient.withSession(session => session.withTransaction(async () => {
    // Keep CSOT in the session. Driver 7.6 bulk helpers otherwise re-pass inherited timeoutMS.
    const transactionDb = mongoClient.db(db.databaseName, { ...db.options, timeoutMS: undefined });
    const transactionNow = new Date(Math.max(Date.now(), now.getTime()));
    const plan = await previewActivityEdit(auth, activityId, input, { now: () => transactionNow,
      getActiveMap: campusId => transactionDb.collection<CampusMapDocument>('campus_maps').findOne({ campusId, status: 'ACTIVE' }, { session }),
      findEditable: (campusId, id) => transactionDb.collection<ActivityDocument>('activities').findOne({ campusId, _id: new ObjectId(id),
        status: { $in: ['ACTIVE', 'FINISHED'] }, visibility: 'PUBLIC', deletedAt: null }, { session }),
      findSeries: async (campusId, id) => (await transactionDb.collection<ActivityDocument>('activities').findOne({ campusId,
        seriesId: new ObjectId(id), 'seriesDefinition._id': new ObjectId(id), 'seriesDefinition.status': 'ACTIVE',
        'seriesDefinition.visibility': 'PUBLIC' }, { session }))?.seriesDefinition ?? null,
      findEditOccurrences: (campusId, id) => transactionDb.collection<ActivityDocument>('activities').find({ campusId, seriesId: new ObjectId(id) }, { session }).toArray(),
    });
    if (plan.previewHash !== input.previewHash) throw new ApiError(409, 'CONFLICT', 'Las actividades cambiaron. Revisa una nueva vista previa.');
    const changed = plan.changes.filter(value => value.changedFields.length);
    const reactivatingCommunity = !accountCapabilities(auth).officialActivities && changed.some(change =>
      change.before.type === 'COMMUNITY_ACTIVITY' && (change.before.status === 'FINISHED' || change.before.endAt <= transactionNow)
      && change.after.status === 'ACTIVE');
    if (reactivatingCommunity) {
      // Share the creation lock so an expired publication cannot be revived alongside a new one.
      const map = await transactionDb.collection<CampusMapDocument>('campus_maps').findOneAndUpdate(
        { campusId: auth.campusId, status: 'ACTIVE' }, { $inc: { communityActivityCreationRevision: 1 } }, { session, returnDocument: 'after' });
      if (!map) throw new ApiError(404, 'NOT_FOUND', 'Active campus map not found.');
      if (await transactionDb.collection<ActivityDocument>('activities').findOne(
        activeCommunityActivityFilter(auth.campusId, auth.userId, transactionNow), { session })) {
        throw new ApiError(409, 'CONFLICT', COMMUNITY_ACTIVITY_LIMIT_MESSAGE);
      }
    }
    if (changed.length) {
      const participantRows = await transactionDb.collection<ActivityParticipationDocument>('activity_participation')
        .find({ campusId: auth.campusId, activityId: { $in: changed.map(change => new ObjectId(change.activityId)) } },
          { session, projection: { activityId: 1, userId: 1, status: 1 } }).toArray();
      const participantsByActivity = new Map<string, ActivityParticipationDocument[]>();
      for (const row of participantRows) {
        const id = row.activityId.toHexString();
        const rows = participantsByActivity.get(id) ?? [];
        rows.push(row); participantsByActivity.set(id, rows);
      }
      const operations = [];
      const histories: ActivityChangeDocument[] = [];
      const recipients = new Map<string, string[]>();
      for (const change of changed) {
        const participants = participantsByActivity.get(change.activityId) ?? [];
        const reasons: ActivityChangeDocument['notificationReasons'] = [];
        if (change.changedFields.some(value => ['startAt', 'endAt'].includes(value))) reasons.push('DATES_CHANGED');
        if (change.changedFields.includes('location')) reasons.push('LOCATION_CHANGED');
        if (change.changedFields.some(value => ['title', 'description'].includes(value))) reasons.push('CONTENT_CHANGED');
        const history: ActivityChangeDocument = { _id: new ObjectId(), operationId, campusId: auth.campusId,
          activityId: new ObjectId(change.activityId), actorUserId: auth.userId, revision: change.revision + 1, scope: input.scope,
          changedAt: transactionNow, before: change.before, after: change.after, changedFields: change.changedFields, notificationReasons: reasons };
        histories.push(history);
        recipients.set(change.activityId, participantsAtChange(participants, auth.userId));
        operations.push({ updateOne: {
          filter: { _id: new ObjectId(change.activityId), campusId: auth.campusId, createdByUserId: auth.userId,
            status: change.before.status, visibility: 'PUBLIC', deletedAt: null,
            ...(change.revision === 0 ? { $or: [{ editRevision: 0 }, { editRevision: { $exists: false } }] } : { editRevision: change.revision }) },
          update: { $set: { title: change.after.title, description: change.after.description, startAt: change.after.startAt, endAt: change.after.endAt,
            location: change.after.location, status: change.after.status, editRevision: change.revision + 1, updatedAt: transactionNow },
            $push: { changeHistory: history } },
        } });
      }
      // One durable event per operation; histories and every revision remain per occurrence.
      Object.assign(operations[0].updateOne.update.$push, { notificationEvents: changed.length === 1
        ? changeNotification(histories[0], recipients.get(histories[0].activityId.toHexString())!)
        : groupedChangeNotification(histories, recipients) });
      const update = await transactionDb.collection<ActivityDocument>('activities').bulkWrite(operations, { session });
      if (update.matchedCount !== changed.length) throw new ApiError(409, 'CONFLICT', 'La actividad cambió. Recarga la ficha antes de editar.');
    }
    const selected = plan.changes.find(value => value.activityId === activityId.toLowerCase())!;
    return { activityId: activityId.toLowerCase(), updatedCount: changed.length, revision: selected.revision + (selected.changedFields.length ? 1 : 0) };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar la edición.');
  return result;
}
