import type { ObjectId } from 'mongodb';
import type { ActivityChangeDocument } from './activities.edit.types.js';

/** Current activities document supplied by the project owner, not the legacy bootstrap. */
export interface ActivityDocument {
  _id: ObjectId;
  campusId: string;
  createdByUserId: string;
  title: string;
  description: string;
  type: string;
  status: string;
  visibility: string;
  startAt: Date;
  endAt: Date;
  bannerUrl?: string | null;
  category?: string | null;
  tags?: string[];
  location: {
    buildingKey: string;
    floorKey: string;
    poiKey?: string | null;
    customLabel?: string | null;
    coordinates?: { x: number; y: number; z: number } | null;
  };
  participantCount: number;
  createdAt: Date;
  updatedAt: Date;
  seriesId?: ObjectId;
  occurrenceIndex?: number;
  occurrenceCount?: number;
  originalStartAt?: Date;
  editRevision?: number;
  changeHistory?: ActivityChangeDocument[];
  /** Canonical creation template, embedded only in occurrence 1. */
  seriesDefinition?: ActivitySeriesDocument;
}

export interface ActivityQuery {
  buildingKey?: string;
  floorKey?: string;
  poiKey?: string;
}

export interface CreateActivityInput {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  location: { buildingKey: string; floorKey: string; poiKey?: string; customLabel?: string };
}

export interface ActivityRecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  until: string;
  timeZone: string;
  excludedDates: string[];
}
export interface CreateActivitySeriesInput extends CreateActivityInput {
  recurrence: ActivityRecurrenceRule;
  previewHash?: string;
}
export interface ActivityOccurrenceDates { index: number; startAt: string; endAt: string }
export interface ActivityRecurrencePreview {
  campusId: string; type: ActivityType; previewHash: string; recurrence: ActivityRecurrenceRule;
  occurrences: ActivityOccurrenceDates[];
  skipped: { date: string; reason: 'INVALID_MONTH_DAY' | 'EXCLUDED' }[];
}
export interface ActivitySeriesDocument extends CreateActivityInput {
  _id: ObjectId; campusId: string; createdByUserId: string; type: ActivityType;
  status: 'ACTIVE'; visibility: 'PUBLIC'; recurrence: ActivityRecurrenceRule;
  occurrenceCount: number; skipped: ActivityRecurrencePreview['skipped']; createdAt: Date; updatedAt: Date;
}
export interface ActivitySeriesDto {
  id: string; campusId: string; title: string; description: string; type: ActivityType;
  recurrence: ActivityRecurrenceRule; occurrenceCount: number;
  occurrences: ActivityDto[];
}

export type ActivityType = 'COMMUNITY_ACTIVITY' | 'OFFICIAL_EVENT';

export interface ActivityDto {
  id: string;
  campusId: string;
  title: string;
  description: string;
  type: ActivityType;
  status: 'ACTIVE';
  startAt: string;
  endAt: string;
  series?: { id: string; index: number; total: number };
  location: {
    buildingKey: string;
    buildingName: string;
    floorKey: string;
    floorName: string;
    poiKey?: string;
    poiName?: string;
    customLabel?: string;
  };
}

export interface ActivityParticipationDocument {
  _id?: ObjectId;
  activityId: ObjectId;
  userId: string;
  campusId: string;
  status: 'JOINED' | 'LEFT';
  joinedAt: Date;
  updatedAt: Date;
}

export interface ActivityDetailDto extends ActivityDto {
  editing?: { revision: number; canEditUpcoming: boolean };
  organizer: { name: string } | null;
  participation: { status: 'JOINED' | 'LEFT' | 'NOT_JOINED'; canJoin: boolean };
  bannerUrl?: string;
  category?: string;
  tags?: string[];
}

/** Own participation only; does not expose an ended or hidden activity's content. */
export interface ActivityParticipationDto {
  activityId: string;
  campusId: string;
  status: 'JOINED' | 'LEFT' | 'NOT_JOINED';
  joinedAt?: string;
  updatedAt?: string;
}

export type ActivityCreatorRecord = Pick<ActivityDocument, '_id' | 'campusId' | 'createdByUserId' | 'createdAt'>;
