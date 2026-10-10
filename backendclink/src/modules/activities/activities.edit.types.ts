import type { ObjectId } from 'mongodb';
import type { ActivityDependencies } from './activities.service.js';
import type { ActivityDocument, CreateActivityInput } from './activities.types.js';

export interface EditActivityInput extends CreateActivityInput {
  scope: 'ONE' | 'UPCOMING'; expectedRevision: number; previewHash?: string;
}
export interface ActivitySnapshot extends CreateActivityInput { type: string }
export interface ActivityEditChange { activityId: string; index?: number; revision: number;
  before: ActivitySnapshot; after: ActivitySnapshot; changedFields: string[] }
export interface ActivityEditPreview {
  campusId: string; activityId: string; scope: EditActivityInput['scope']; previewHash: string;
  timeZone?: string; changes: ActivityEditChange[];
}
export interface ActivityEditResult { activityId: string; updatedCount: number; revision: number }
/** Embedded in ActivityDocument.changeHistory; never stored in a new collection. */
export interface ActivityChangeDocument {
  _id: ObjectId; operationId: ObjectId; campusId: string; activityId: ObjectId; seriesId?: ObjectId;
  actorUserId: string; revision: number; scope: EditActivityInput['scope']; changedAt: Date;
  before: ActivitySnapshot; after: ActivitySnapshot; changedFields: string[];
  notificationReasons: ('DATES_CHANGED' | 'LOCATION_CHANGED' | 'CONTENT_CHANGED')[];
}
export interface ActivityEditDependencies extends ActivityDependencies {
  findEditable?: (campusId: string, activityId: string) => Promise<ActivityDocument | null>;
  findEditOccurrences?: (campusId: string, seriesId: string) => Promise<ActivityDocument[]>;
  saveEdit?: (plan: ActivityEditPreview) => Promise<ActivityEditResult>;
}
