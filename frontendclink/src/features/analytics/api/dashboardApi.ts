import { authenticatedEnvelopeRequest } from '@/lib/api/authenticated-request';
import type { DashboardData } from '../types/dashboard';

export async function loadDashboard(from: string, to: string, campusId: string, signal: AbortSignal): Promise<DashboardData> {
  const query = new URLSearchParams({ from, to, campusId });
  return (await authenticatedEnvelopeRequest<DashboardData>('/api/v1/analytics/dashboard', { signal }, query)).data;
}
