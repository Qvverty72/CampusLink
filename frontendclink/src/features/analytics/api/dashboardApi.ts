import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { DashboardData, DashboardFilters, DashboardGrouping, DashboardOptions } from '../types/dashboard';

export async function loadDashboard(from: string, to: string, campusId: string, signal: AbortSignal, filters?: DashboardFilters, grouping?: DashboardGrouping): Promise<DashboardData> {
  const query = new URLSearchParams({ from, to, ...(grouping ? { grouping } : {}), ...(filters
    ? { institutionId: filters.institutionId, campusIds: filters.campusIds.join(','), ...(filters.careerId ? { careerId: filters.careerId } : {}) }
    : { campusId }) });
  return (await authenticatedEnvelopeRequest<DashboardData>('/api/v1/analytics/dashboard', { signal }, query)).data;
}

export async function loadDashboardOptions(signal: AbortSignal): Promise<DashboardOptions> {
  return (await authenticatedEnvelopeRequest<DashboardOptions>('/api/v1/analytics/options', { signal })).data;
}
