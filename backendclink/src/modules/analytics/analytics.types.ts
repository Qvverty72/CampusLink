import type { ModuleHealth } from '../../types/api.types.js';

export type AnalyticsHealth = ModuleHealth<'analytics'>;

export type DashboardGrouping = 'week' | 'month';
export interface DashboardQuery { institutionId: string; campusIds: string[]; careerId: string | null; from: string; to: string; grouping: DashboardGrouping }
export interface DashboardOptions {
  institutions: { id: string; name: string; campuses: { id: string; name: string }[];
    careers: { id: string; name: string; campusIds: string[] }[] }[];
}
export interface DashboardScope {
  institutionId: string;
  institutionName: string;
  campusId: string | null;
  campusName: string;
  campuses: { id: string; name: string }[];
  career: { id: string; name: string } | null;
}
export interface DashboardPeriod { from: string; to: string; timeZone: string; cutoff: string }
export interface DashboardMetric { value: number | null; period: DashboardPeriod; scope: DashboardScope }
export interface DemandCount { views: number; requests: number }
export interface SubjectDemand extends DemandCount { subjectId: string; subjectName: string }
export interface DashboardMetrics {
  scope: DashboardScope;
  period: DashboardPeriod;
  activeUsers: DashboardMetric;
  resourceDemand: DashboardMetric & DemandCount;
  subjectDemand: DashboardMetric & DemandCount & { subjects: SubjectDemand[] };
  activityParticipation: DashboardMetric & { label: string; legacyEvents: number };
}
export interface DashboardInterval {
  key: string;
  label: string;
  period: DashboardPeriod;
  status: 'recorded' | 'no_activity' | 'unavailable';
  coverage: 'partial' | 'unavailable';
  metrics: DashboardMetrics | null;
}
export interface DashboardData extends DashboardMetrics {
  generatedAt: string;
  grouping: DashboardGrouping;
  intervals: DashboardInterval[];
  notes: string[];
}

/** Instantánea persistida; sus resultados nunca se reconstruyen al leerla. */
export interface AnalyticalReport extends DashboardData {
  id: string;
  generatedBy: { userId: string; name: string; email?: string | null };
  calculationVersion: 'campuslink-kpi-v1';
}

export type HistoricalReportSummary = Pick<AnalyticalReport, 'id' | 'generatedAt' | 'generatedBy' | 'scope' | 'period' | 'grouping' | 'calculationVersion'>;
export interface HistoricalReportsQuery {
  institutionId: string; campusIds: string[]; careerId: string | null;
  from: string | null; to: string | null; grouping: DashboardGrouping | null; limit: number;
  cursor: { generatedAt: string; id: string } | null;
}

export interface ResourceAnalyticsEvent {
  key: string;
  type: 'VISTA' | 'SOLICITUD_CREADA' | 'TRANSACCION_RESERVADA' | 'TRANSACCION_PENDIENTE_CONFIRMACION' | 'TRANSACCION_COMPLETADA' | 'TRANSACCION_CANCELADA';
  campusId: string;
  publicationId: string;
  userId: string | null;
  requestId: string | null;
  transactionId: string | null;
  occurredAt: string;
}
