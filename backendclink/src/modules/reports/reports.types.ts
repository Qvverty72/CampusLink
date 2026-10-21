import type { ModuleHealth } from '../../types/api.types.js';
import type { ActivityDto } from '../activities/activities.types.js';
import type { ActivityDependencies } from '../activities/activities.service.js';

export type ReportsHealth = ModuleHealth<'reports'>;

export interface ContentReportInput { reason: string; description?: string }
export type ReportActivityInput = ContentReportInput;
export interface ContentReportReceipt { id:string;campusId:string;status:'PENDIENTE';reportedAt:string }
export interface PhysicalgoodsReportReceipt extends ContentReportReceipt {
  publicationId:string; transactionId:string|null;
}
export interface NewContentReport extends ContentReportInput {
  userId:string;campusId:string;entityType:'ACTIVIDAD'|'PUBLICACION_FISICA'|'PUBLICACION_DIGITAL'|'TRANSACCION';entityId:string;snapshot:unknown;
}
export interface ActivityReportReceipt {
  id: string; activityId: string; campusId: string;
  status: 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESESTIMADO'; reportedAt: string;
  reason: string; description: string | null;
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
  findOwnActivityReport?: (userId: string, campusId: string, activityId: string) => Promise<ActivityReportReceipt | null>;
}
