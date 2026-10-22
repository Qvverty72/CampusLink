import type { ModuleHealth } from '../../types/api.types.js';

export type AnalyticsHealth = ModuleHealth<'analytics'>;

export interface DashboardQuery { institutionId: string; campusIds: string[]; careerId: string | null; from: string; to: string }
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
export interface DashboardPeriod { from: string; to: string; timeZone: 'UTC'; cutoff: string }
export interface DashboardMetric { value: number; period: DashboardPeriod; scope: DashboardScope }
export interface DemandCount { views: number; requests: number }
export interface SubjectDemand extends DemandCount { subjectId: string; subjectName: string }
export interface DashboardData {
  scope: DashboardScope;
  period: DashboardPeriod;
  generatedAt: string;
  activeUsers: DashboardMetric;
  resourceDemand: DashboardMetric & DemandCount;
  subjectDemand: DashboardMetric & DemandCount & { subjects: SubjectDemand[] };
  activityParticipation: DashboardMetric & { label: string; legacyEvents: number };
  notes: string[];
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
