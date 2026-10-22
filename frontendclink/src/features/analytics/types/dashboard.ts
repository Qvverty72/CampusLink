export interface DashboardScope {
  institutionId: string;
  institutionName: string;
  campusId: string | null;
  campusName: string;
  campuses: { id: string; name: string }[];
  career: { id: string; name: string } | null;
}
export interface DashboardFilters { institutionId: string; campusIds: string[]; careerId?: string }
export interface DashboardOptions {
  institutions: { id: string; name: string; campuses: { id: string; name: string }[];
    careers: { id: string; name: string; campusIds: string[] }[] }[];
}
export type DashboardGrouping = 'week' | 'month';
export interface DashboardPeriod { from: string; to: string; timeZone: string; cutoff: string }
export interface DashboardMetric { value: number | null; period: DashboardPeriod; scope: DashboardScope }
interface DemandCount { views: number; requests: number }
export interface DashboardMetrics {
  period: DashboardPeriod;
  scope: DashboardScope;
  activeUsers: DashboardMetric;
  resourceDemand: DashboardMetric & DemandCount;
  subjectDemand: DashboardMetric & DemandCount & {
    subjects: (DemandCount & { subjectId: string; subjectName: string })[];
  };
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

export interface AnalyticalReport extends DashboardData {
  id: string;
  generatedBy: { userId: string; name: string };
  calculationVersion: 'campuslink-kpi-v1';
}
