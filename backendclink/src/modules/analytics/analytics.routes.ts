import { Router } from 'express';
import { getAnalyticsHealthController, getDashboardController, recordResourceViewController } from './analytics.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';

// El servicio exige reportería por campus para las consultas de métricas.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAnalyticsHealthController);
  router.get('/dashboard', requireAuthentication, getDashboardController);
  router.post('/resources/:publicationId/views', requireAuthentication, recordResourceViewController);
  return router;
}
