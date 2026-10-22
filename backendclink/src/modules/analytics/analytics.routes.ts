import { Router } from 'express';
import { getAnalyticsHealthController, recordResourceViewController } from './analytics.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';

// La ingesta exige identidad vigente; no expone consultas públicas de métricas.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAnalyticsHealthController);
  router.post('/resources/:publicationId/views', requireAuthentication, recordResourceViewController);
  return router;
}
