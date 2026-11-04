import { getMongoDB as getMongoDb } from '../../../database/mongodb/client.js';
import { visibleActivityFilter } from '../domain/activities.policy.js';
import type { ActivityDocument } from '../types/activities.types.js';


/** Une únicamente la participación propia; LEFT explícito prevalece sobre el creador legado. */
export function joinedActivitiesPipeline(campusId: string, userId: string, now: Date) {
  return [
    { $match: visibleActivityFilter(campusId, now) },
    { $lookup: { from: 'activity_participation', let: { activityId: '$_id' }, pipeline: [
      { $match: { campusId, userId, $expr: { $eq: ['$activityId', '$$activityId'] } } },
      { $project: { status: 1 } },
    ], as: 'ownParticipation' } },
    { $match: { $or: [
      { 'ownParticipation.status': 'JOINED' },
      { createdByUserId: userId, ownParticipation: { $size: 0 } },
    ] } },
    { $unset: 'ownParticipation' },
  ];
}


export async function findJoinedActivities(campusId: string, userId: string, now: Date) {
  return getMongoDb().collection<ActivityDocument>('activities')
    .aggregate<ActivityDocument>(joinedActivitiesPipeline(campusId, userId, now)).toArray();
}
