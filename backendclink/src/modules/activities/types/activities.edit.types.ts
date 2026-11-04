import type { ObjectId } from 'mongodb';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import type { ActivityDependencies } from '../services/activities.service.js';
import type { ActivityDocument, CreateActivityInput } from './activities.types.js';

export interface EditActivityInput extends CreateActivityInput {
  scope: 'ONE'; expectedRevision: number; previewHash?: string;
}
export interface ActivitySnapshot extends Omit<CreateActivityInput, 'location'> {
  type: string; status?: string; deletedAt?: Date; location: ActivityDocument['location'];
}
export interface ActivityEditChange { activityId: string; index?: number; revision: number;
  before: ActivitySnapshot; after: ActivitySnapshot; changedFields: string[] }
export interface ActivityEditPreview {
  campusId: string; activityId: string; scope: EditActivityInput['scope']; previewHash: string;
  timeZone?: string; changes: ActivityEditChange[];
}
export interface ActivityEditResult { activityId: string; updatedCount: number; revision: number }
/** Se embebe en `ActivityDocument.changeHistory`; no crea una colección adicional. */
export interface ActivityChangeDocument {
  _id: ObjectId; operationId: ObjectId; campusId: string; activityId: ObjectId; seriesId?: ObjectId;
  // Los cambios grupales históricos siguen siendo legibles; las nuevas entradas solo aceptan ONE.
  actorUserId: string; revision: number; scope: 'ONE' | 'UPCOMING'; changedAt: Date;
  before: ActivitySnapshot; after: ActivitySnapshot; changedFields: string[];
  notificationReasons: ('DATES_CHANGED' | 'LOCATION_CHANGED' | 'CONTENT_CHANGED')[];
}
export interface ActivityEditDependencies extends ActivityDependencies {
  findEditable?: (campusId: string, activityId: string) => Promise<ActivityDocument | null>;
  saveEdit?: (plan: ActivityEditPreview) => Promise<ActivityEditResult>;
}

/** El repositorio revalida el plan con lectores de su propia transacción. */
export type ActivityEditPlanner = (auth: VerifiedAuthConnection, activityId: string, input: EditActivityInput,
  dependencies: ActivityEditDependencies) => Promise<ActivityEditPreview>;
