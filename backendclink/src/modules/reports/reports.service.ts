import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeReportsDependencies } from './reports.repository.js';
import type { ReportsHealth } from './reports.types.js';

export const getReportsHealth: () => Promise<ReportsHealth> =
  createModuleHealthCheck('reports', probeReportsDependencies);
