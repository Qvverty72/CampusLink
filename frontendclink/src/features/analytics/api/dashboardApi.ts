import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';

export interface DashboardScope {
  institutionId: string;
  institutionName: string;
  campusId: string;
  campusName: string;
}
export interface DashboardPeriod { from: string; to: string; timeZone: string; cutoff: string }
export interface DashboardMetric { value: number; period: DashboardPeriod; scope: DashboardScope }
export interface DashboardData {
  period: DashboardPeriod;
  scope: DashboardScope;
  generatedAt: string;
  activeUsers: DashboardMetric;
  resourceDemand: DashboardMetric & { views: number; requests: number };
  subjectDemand: DashboardMetric & { subjects: { subjectId: string; subjectName: string; views: number; requests: number }[] };
  activityParticipation: DashboardMetric & { label: string };
}

export async function loadDashboard(from: string, to: string, signal: AbortSignal): Promise<DashboardData> {
  const query = new URLSearchParams({ from, to });
  return (await authenticatedEnvelopeRequest<DashboardData>('/api/v1/analytics/dashboard', { signal }, query)).data;
}
