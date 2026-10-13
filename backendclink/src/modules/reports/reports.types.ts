import type { ModuleHealth } from '../../types/api.types.js';
import type { ActivityDto } from '../activities/activities.types.js';
import type { ActivityDependencies } from '../activities/activities.service.js';

export type ReportsHealth = ModuleHealth<'reports'>;

export type ReportTargetType = 'PUBLICACION_FISICA' | 'PUBLICACION_DIGITAL' | 'ACTIVIDAD' | 'TRANSACCION';
export interface ReportInput { reason: string; description?: string }
export interface ReportTarget { targetType: ReportTargetType; targetId: string }
export interface ReportContentInput extends ReportInput, ReportTarget {}
export interface ContentReportReceipt extends ReportTarget {
  id: string; campusId: string; status: 'PENDIENTE'; reportedAt: string;
}
export interface NewContentReport extends ReportContentInput {
  userId: string; accountCampusId: string;
}

export type ReportActivityInput = ReportInput;
export interface ActivityReportReceipt {
  id: string; activityId: string; campusId: string; status: 'PENDIENTE'; reportedAt: string;
}
export interface ActivityReportSnapshot extends ActivityDto {
  visibility: 'PUBLIC'; revision: number; createdByUserId?: string;
  bannerUrl?: string; category?: string; tags?: string[];
}
export interface NewActivityReport extends ReportActivityInput {
  activityId: string; campusId: string; userId: string; snapshot: ActivityReportSnapshot;
}
export interface ReportsDependencies extends Pick<ActivityDependencies, 'getActiveMap' | 'findActivity' | 'now'> {
  saveActivityReport?: (report: NewActivityReport) => Promise<ActivityReportReceipt>;
  saveContentReport?: (report: NewContentReport) => Promise<ContentReportReceipt>;
}
