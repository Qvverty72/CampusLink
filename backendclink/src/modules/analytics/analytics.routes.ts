import { Router } from 'express';
import { generateAnalyticalReportController, getAnalyticalReportController, getAnalyticsHealthController, getDashboardController, getDashboardOptionsController, recordResourceViewController } from './analytics.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';

// El servicio exige reportería por campus para las consultas de métricas.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAnalyticsHealthController);
  router.get('/dashboard', requireAuthentication, getDashboardController);
  router.get('/options', requireAuthentication, getDashboardOptionsController);
  router.post('/reports', requireAuthentication, generateAnalyticalReportController);
  router.get('/reports/:reportId', requireAuthentication, getAnalyticalReportController);
  router.post('/resources/:publicationId/views', requireAuthentication, recordResourceViewController);
  return router;
}
