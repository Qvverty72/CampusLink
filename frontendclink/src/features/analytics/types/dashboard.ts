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
export interface DashboardPeriod { from: string; to: string; timeZone: 'UTC'; cutoff: string }
export interface DashboardMetric { value: number; period: DashboardPeriod; scope: DashboardScope }
interface DemandCount { views: number; requests: number }
export interface DashboardData {
  period: DashboardPeriod;
  scope: DashboardScope;
  generatedAt: string;
  activeUsers: DashboardMetric;
  resourceDemand: DashboardMetric & DemandCount;
  subjectDemand: DashboardMetric & DemandCount & {
    subjects: (DemandCount & { subjectId: string; subjectName: string })[];
  };
  activityParticipation: DashboardMetric & { label: string; legacyEvents: number };
  notes: string[];
}
