import type { PaginationParams } from '../../types/api.js';
import type { ActivityDocument } from '../activities/activities.types.js';
import type { ReportTargetType } from './reports.types.js';
import type { reviewRepository } from './reports.review.repository.js';

export type ReviewTargetType = ReportTargetType | 'COMPORTAMIENTO';
export type ReportStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESESTIMADO';
export interface ReviewQuery extends PaginationParams { status?: ReportStatus; targetType?: ReviewTargetType }
export interface ReviewSummary {
  id: string; campusId: string; targetType: ReviewTargetType; targetId: string;
  title: string | null; reason: string; status: ReportStatus; reportedAt: string;
}
export interface ReviewRecord extends ReviewSummary {
  description: string | null; reporterId: string; snapshot: unknown;
}
export interface ReviewPerson { id: string; name: string | null }
export interface ReviewDetail extends ReviewSummary {
  description: string | null; reporter: ReviewPerson;
  snapshot: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
  participants: ReviewPerson[];
  activityChanges: Record<string, unknown>[];
}
export interface ReviewDependencies {
  transaction?: <T>(operation: (repository: ReturnType<typeof reviewRepository>) => Promise<T>) => Promise<T>;
  findReportedActivity?: (campusId: string, activityId: string) => Promise<ActivityDocument | null>;
}
