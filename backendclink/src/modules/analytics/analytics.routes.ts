import { createPolicyRouter, publicEndpoint } from '../../middleware/endpoint-policy.js';
import type { Router } from 'express';
import { exportAnalyticalReportController, generateAnalyticalReportController, getAnalyticalReportController, getAnalyticsHealthController, getDashboardController, getDashboardOptionsController, listHistoricalReportsController, recordResourceViewController } from './analytics.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';

// El servicio exige reportería por campus para las consultas de métricas.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = createPolicyRouter();
  if (diagnosticsEnabled) router.get('/health', publicEndpoint, getAnalyticsHealthController);
  router.get('/dashboard', requireAuthentication, getDashboardController);
  router.get('/options', requireAuthentication, getDashboardOptionsController);
  router.post('/reports', requireAuthentication, generateAnalyticalReportController);
  router.get('/reports', requireAuthentication, listHistoricalReportsController);
  router.get('/reports/:reportId/export/:format', requireAuthentication, exportAnalyticalReportController);
  router.get('/reports/:reportId', requireAuthentication, getAnalyticalReportController);
  router.post('/resources/:publicationId/views', requireAuthentication, recordResourceViewController);
  return router;
}
