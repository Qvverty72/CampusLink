import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { AnalyticalReport, DashboardData, DashboardFilters, DashboardGrouping, DashboardOptions, HistoricalReportsFilters, HistoricalReportsPage } from '../types/dashboard';

function dashboardQuery(from: string, to: string, campusId: string, filters?: DashboardFilters, grouping?: DashboardGrouping) {
  return new URLSearchParams({ from, to, ...(grouping ? { grouping } : {}), ...(filters
    ? { institutionId: filters.institutionId, campusIds: filters.campusIds.join(','), ...(filters.careerId ? { careerId: filters.careerId } : {}) }
    : { campusId }) });
}

export async function loadDashboard(from: string, to: string, campusId: string, signal: AbortSignal, filters?: DashboardFilters, grouping?: DashboardGrouping): Promise<DashboardData> {
  return (await authenticatedEnvelopeRequest<DashboardData>('/api/v1/analytics/dashboard', { signal }, dashboardQuery(from, to, campusId, filters, grouping))).data;
}

export async function generateAnalyticalReport(from: string, to: string, campusId: string, signal: AbortSignal, filters: DashboardFilters, grouping: DashboardGrouping): Promise<AnalyticalReport> {
  const body = Object.fromEntries(dashboardQuery(from, to, campusId, filters, grouping));
  return (await authenticatedEnvelopeRequest<AnalyticalReport>('/api/v1/analytics/reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })).data;
}

export async function loadDashboardOptions(signal: AbortSignal): Promise<DashboardOptions> {
  return (await authenticatedEnvelopeRequest<DashboardOptions>('/api/v1/analytics/options', { signal })).data;
}

export async function loadHistoricalReports(filters: HistoricalReportsFilters, cursor: string | null, signal: AbortSignal): Promise<HistoricalReportsPage> {
  const query = new URLSearchParams();
  for (const key of ['institutionId', 'careerId', 'from', 'to', 'grouping'] as const) {
    if (filters[key]) query.set(key, filters[key]);
  }
  if (filters.campusIds?.length) query.set('campusIds', filters.campusIds.join(','));
  if (cursor) query.set('cursor', cursor);
  return (await authenticatedEnvelopeRequest<HistoricalReportsPage>('/api/v1/analytics/reports', { signal }, query)).data;
}

export async function loadHistoricalReport(id: string, signal: AbortSignal): Promise<AnalyticalReport> {
  return (await authenticatedEnvelopeRequest<AnalyticalReport>(`/api/v1/analytics/reports/${encodeURIComponent(id)}`, { signal })).data;
}
