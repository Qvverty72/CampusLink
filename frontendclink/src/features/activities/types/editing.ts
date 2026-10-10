import type { Activity, ActivityDetail } from './activity';
import { localActivityTimestamp, validateActivityDraft, type ActivityDraft, type ActivityLocationOption, type CreateActivityInput } from './creation';

export interface EditActivityInput extends CreateActivityInput { scope: 'ONE' | 'UPCOMING'; expectedRevision: number; previewHash?: string }
interface Snapshot extends CreateActivityInput { type: Activity['type'] }
export interface ActivityEditPreview { campusId: string; activityId: string; scope: EditActivityInput['scope']; previewHash: string; timeZone?: string;
  changes: { activityId: string; index?: number; revision: number; before: Snapshot; after: Snapshot; changedFields: string[] }[] }
export interface ActivityEditResult { activityId: string; updatedCount: number; revision: number }

export function activityEditDraft(activity: Activity): ActivityDraft {
  const fields = (value: string) => { const date = new Date(value); const pad = (number: number) => String(number).padStart(2, '0');
    return { date: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` }; };
  const start = fields(activity.startAt), end = fields(activity.endAt);
  return { title: activity.title, description: activity.description, startDate: start.date, startTime: start.time,
    endDate: end.date, endTime: end.time, buildingKey: activity.location.buildingKey, floorKey: activity.location.floorKey,
    poiKey: activity.location.poiKey ?? '', customLabel: activity.location.customLabel ?? '' };
}

export function validateActivityEditDraft(draft: ActivityDraft, activity: ActivityDetail, locations: ActivityLocationOption[], scope: EditActivityInput['scope']):
  { input: EditActivityInput; error?: never } | { error: string; input?: never } {
  if (!activity.editing) return { error: 'Solo el creador puede editar esta publicación.' };
  const original = activityEditDraft(activity);
  // Keep exact seconds/milliseconds when users only change another field.
  const startAt = draft.startDate === original.startDate && draft.startTime === original.startTime ? activity.startAt : localActivityTimestamp(draft.startDate, draft.startTime);
  const endAt = draft.endDate === original.endDate && draft.endTime === original.endTime ? activity.endAt : localActivityTimestamp(draft.endDate, draft.endTime);
  const parsed = validateActivityDraft(draft, locations, Date.now(), { allowEnded: true, timestamps: { startAt, endAt } });
  if (!parsed.input) return { error: parsed.error };
  return { input: { ...parsed.input, scope, expectedRevision: activity.editing.revision } };
}
