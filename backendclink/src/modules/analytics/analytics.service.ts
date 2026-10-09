import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeAnalyticsDependencies } from './analytics.repository.js';
import type { AnalyticsHealth } from './analytics.types.js';

export const getAnalyticsHealth: () => Promise<AnalyticsHealth> =
  createModuleHealthCheck('analytics', probeAnalyticsDependencies);
