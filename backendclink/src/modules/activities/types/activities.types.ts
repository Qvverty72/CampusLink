import type { ObjectId } from 'mongodb';
import type { ActivityChangeDocument } from './activities.edit.types.js';
import type { ActivityNotificationEvent } from '../domain/activities.notifications.js';

/** Documento persistido de actividad con metadatos de ubicación, participación, edición y recurrencia. */
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
  deletedAt?: Date | null;
  deletedByUserId?: string;
  seriesId?: ObjectId;
  occurrenceIndex?: number;
  occurrenceCount?: number;
  originalStartAt?: Date;
  editRevision?: number;
  changeHistory?: ActivityChangeDocument[];
  notificationEvents?: ActivityNotificationEvent[];
  /** Plantilla canónica de creación, embebida solo en la ocurrencia 1. */
  seriesDefinition?: ActivitySeriesDocument;
}

/** Filtros espaciales que comparten el listado y las consultas por ubicación. */
export interface ActivityQuery {
  buildingKey?: string;
  floorKey?: string;
  poiKey?: string;
}

/** Excepción interna para crear sin límite comunitario cuando la política lo permite. */
export interface ActivityCreationOptions { limitActiveCommunity?: boolean }
export interface CommunityActivityCreationAvailability {
  campusId: string;
  canCreate: boolean;
  message?: string;
}

export interface CreateActivityInput {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  location: { buildingKey: string; floorKey: string; poiKey?: string; customLabel?: string };
}

/** Regla civil de recurrencia: conserva zona horaria y fechas exclusivas del calendario. */
export interface ActivityRecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  until: string;
  timeZone: string;
  excludedDates: string[];
  /** Días ISO opcionales (lunes=1, domingo=7), solo para reglas semanales; omitido conserva el anclaje anterior. */
  weekdays?: number[];
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

/** Contrato público del listado; omite datos internos de persistencia y participantes. */
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
  /** Conserva lectura de alias legados; la migración inicializa contadores sin inventar eventos pasados. */
  firstJoinedAt?: Date | null;
  lastJoinedAt?: Date;
  lastLeftAt?: Date | null;
  joinCount?: number;
  leaveCount?: number;
  historyComplete?: boolean;
}

export type ActivityInteractionType = 'VIEWED' | 'JOINED' | 'LEFT';
export interface ActivityInteractionDocument {
  _id: ObjectId;
  activityId: ObjectId;
  campusId: string;
  userId: string;
  type: ActivityInteractionType;
  occurredAt: Date;
  eventKey: string;
  provenance: 'LIVE' | 'LEGACY_STATE';
}

export interface ActivityDetailDto extends ActivityDto {
  /** Se omite cuando los datos antiguos no contienen un conteo válido. */
  participantCount?: number;
  editing?: { revision: number; canEditUpcoming: boolean };
  organizer: { name: string } | null;
  participation: { status: 'JOINED' | 'LEFT' | 'NOT_JOINED'; canJoin: boolean; canLeave: boolean };
  bannerUrl?: string;
  category?: string;
  tags?: string[];
}

/** Participación propia; no expone contenido de actividades finalizadas u ocultas. */
export interface ActivityParticipationDto {
  activityId: string;
  campusId: string;
  status: 'JOINED' | 'LEFT' | 'NOT_JOINED';
  canLeave: boolean;
  joinedAt?: string;
  updatedAt?: string;
}

export type ActivityCreatorRecord = Pick<ActivityDocument, '_id' | 'campusId' | 'createdByUserId' | 'createdAt'>;

export interface ActivityParticipantsQuery { page: number; pageSize: number }
export interface ActivityParticipantsPage extends ActivityParticipantsQuery {
  activityId: string; campusId: string; total: number;
  participants: { key: string; name: string | null; isCurrentUser: boolean }[];
}
/** Los identificadores internos se resuelven a nombres antes de devolver la página pública. */
export interface ActivityParticipantsRecords extends ActivityParticipantsQuery {
  total: number; rows: { key: string; userId: string }[];
}
export interface ActivityDeletionResult {
  activityId: string; campusId: string; revision: number; deletedAt: string;
}
