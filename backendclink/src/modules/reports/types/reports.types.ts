import type { ModuleHealth } from '../../../shared/health/health.types.js';
import type { ActivityDto } from '../../activities/types/activities.types.js';
import type { ActivityDependencies } from '../../activities/services/activities.service.js';

export type ReportsHealth = ModuleHealth<'reports'>;

export type ReportStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESESTIMADO';
export type ReportEntityType = 'ACTIVIDAD' | 'PUBLICACION_FISICA' | 'PUBLICACION_DIGITAL' | 'TRANSACCION';

export interface ReportPerson { id: string; name: string | null; email: string | null }
/** Contactos vigentes de IDs del caso; no forman parte de la evidencia histórica. */
export interface ReportPeople {
  source: 'CURRENT_PROFILE'; reporter: ReportPerson | null; reported: ReportPerson | null; decisionMaker: ReportPerson | null;
}

export interface ReportReviewSummary {
  id: string; campusId: string; entityType: string; entityId: string;
  title: string | null; reason: string; status: string; reportedAt: string;
  resolution?: { measure: string | null; resolvedById: string | null; resolvedAt: string | null } | null;
}
export interface ReportReviewDetail extends ReportReviewSummary {
  resolution: { justification: string; measure: string; resolvedById: string; resolvedAt: string } | null;
  description: string | null;
  reporter: { id: string; name: string | null };
  people?: ReportPeople;
  snapshot: (Record<string, unknown> & {
    publication?: Record<string, unknown> & { id?: string; tipo_recurso?: string; files?: { id?: string }[] };
    transaction?: Record<string, unknown> & { id?: string };
  }) | null;
  currentPublication: { id: string; title: string; status: string; deletedAt: string | null } | null;
  currentTransaction: Record<string, unknown> | null;
}

export interface ReportResolutionSummary extends ReportReviewSummary {
  resolution: { justification: string | null; measure: string | null; resolvedById: string | null; resolvedAt: string | null };
}
export interface ReportResolutionDetail extends Omit<ReportReviewDetail, 'resolution'> {
  resolution: ReportResolutionSummary['resolution'];
}

export interface ReportResolutionInput { decision: 'DESESTIMAR' | 'ACOGER'; justification: string }

export interface ContentReportInput { reason: string; description?: string }
export type ReportActivityInput = ContentReportInput;
export interface ContentReportReceipt { id:string;campusId:string;status:'PENDIENTE'|'EN_REVISION'|'RESUELTO'|'DESESTIMADO';reportedAt:string }
export interface PhysicalgoodsReportReceipt extends ContentReportReceipt {
  publicationId:string; transactionId:string|null;
  reason?:string;description?:string|null;
}
export interface NewContentReport extends ContentReportInput {
  userId:string;campusId:string;entityType:ReportEntityType;entityId:string;snapshot:unknown;
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
export interface ReportsDependencies extends Pick<ActivityDependencies, 'getActiveMap' | 'findActivity' | 'findValidCreators' | 'now'> {
  saveActivityReport?: (report: NewActivityReport) => Promise<ActivityReportReceipt>;
  findOwnActivityReport?: (userId: string, campusId: string, activityId: string) => Promise<ActivityReportReceipt | null>;
}
