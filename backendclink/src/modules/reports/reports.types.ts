import type { ModuleHealth } from '../../types/api.types.js';
import type { ActivityDto } from '../activities/activities.types.js';
import type { ActivityDependencies } from '../activities/activities.service.js';

export type ReportsHealth = ModuleHealth<'reports'>;

export interface ReportReviewSummary {
  id: string; campusId: string; entityType: string; entityId: string;
  title: string | null; reason: string; status: string; reportedAt: string;
}
export interface ReportReviewDetail extends ReportReviewSummary {
  resolution: { justification: string; measure: string; resolvedById: string; resolvedAt: string } | null;
  description: string | null;
  reporter: { id: string; name: string | null };
  snapshot: (Record<string, unknown> & {
    publication?: Record<string, unknown> & { id?: string; tipo_recurso?: string; files?: { id?: string }[] };
    transaction?: Record<string, unknown> & { id?: string };
  }) | null;
  currentPublication: { id: string; title: string; status: string; deletedAt: string | null } | null;
  currentTransaction: Record<string, unknown> | null;
}

export interface ReportResolutionInput { decision: 'DESESTIMAR' | 'ACOGER'; justification: string }

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
}
