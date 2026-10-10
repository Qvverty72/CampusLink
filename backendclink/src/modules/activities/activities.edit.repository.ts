import { ObjectId } from 'mongodb';
import { getMongoDb } from '../../config/mongodb.js';
import { mongoClient } from '../../database/mongodb/client.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import type { CampusMapDocument } from '../maps/map.types.js';
import { ApiError } from '../../services/apiError.js';
import type { ActivityDocument, ActivityParticipationDocument } from './activities.types.js';
import type { ActivityChangeDocument, ActivityEditResult, EditActivityInput } from './activities.edit.types.js';
import { previewActivityEdit } from './activities.edit.service.js';
import { changeNotification, participantsAtChange } from './activities.notifications.js';

export const findEditableActivity = (campusId: string, activityId: string) => getMongoDb().collection<ActivityDocument>('activities')
  .findOne({ campusId, _id: new ObjectId(activityId), status: 'ACTIVE', visibility: 'PUBLIC' });
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
      findEditable: (campusId, id) => transactionDb.collection<ActivityDocument>('activities').findOne({ campusId, _id: new ObjectId(id), status: 'ACTIVE', visibility: 'PUBLIC' }, { session }),
      findSeries: async (campusId, id) => (await transactionDb.collection<ActivityDocument>('activities').findOne({ campusId,
        seriesId: new ObjectId(id), 'seriesDefinition._id': new ObjectId(id), 'seriesDefinition.status': 'ACTIVE',
        'seriesDefinition.visibility': 'PUBLIC' }, { session }))?.seriesDefinition ?? null,
      findEditOccurrences: (campusId, id) => transactionDb.collection<ActivityDocument>('activities').find({ campusId, seriesId: new ObjectId(id) }, { session }).toArray(),
    });
    if (plan.previewHash !== input.previewHash) throw new ApiError(409, 'CONFLICT', 'Las actividades cambiaron. Revisa una nueva vista previa.');
    const changed = plan.changes.filter(value => value.changedFields.length);
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
      for (const change of changed) {
        const participants = participantsByActivity.get(change.activityId) ?? [];
        const reasons: ActivityChangeDocument['notificationReasons'] = [];
        if (change.changedFields.some(value => ['startAt', 'endAt'].includes(value))) reasons.push('DATES_CHANGED');
        if (change.changedFields.includes('location')) reasons.push('LOCATION_CHANGED');
        if (change.changedFields.some(value => ['title', 'description'].includes(value))) reasons.push('CONTENT_CHANGED');
        const history: ActivityChangeDocument = { _id: new ObjectId(), operationId, campusId: auth.campusId,
          activityId: new ObjectId(change.activityId), actorUserId: auth.userId, revision: change.revision + 1, scope: input.scope,
          changedAt: transactionNow, before: change.before, after: change.after, changedFields: change.changedFields, notificationReasons: reasons };
        operations.push({ updateOne: {
          filter: { _id: new ObjectId(change.activityId), campusId: auth.campusId, createdByUserId: auth.userId,
            ...(change.revision === 0 ? { $or: [{ editRevision: 0 }, { editRevision: { $exists: false } }] } : { editRevision: change.revision }) },
          update: { $set: { title: change.after.title, description: change.after.description, startAt: change.after.startAt, endAt: change.after.endAt,
            location: change.after.location, editRevision: change.revision + 1, updatedAt: transactionNow },
            $push: { changeHistory: history, notificationEvents: changeNotification(history, participantsAtChange(participants, auth.userId)) } },
        } });
      }
      const update = await transactionDb.collection<ActivityDocument>('activities').bulkWrite(operations, { session });
      if (update.matchedCount !== changed.length) throw new ApiError(409, 'CONFLICT', 'La actividad cambió. Recarga la ficha antes de editar.');
    }
    const selected = plan.changes.find(value => value.activityId === activityId.toLowerCase())!;
    return { activityId: activityId.toLowerCase(), updatedCount: changed.length, revision: selected.revision + (selected.changedFields.length ? 1 : 0) };
  }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }));
  if (!result) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar la edición.');
  return result;
}
