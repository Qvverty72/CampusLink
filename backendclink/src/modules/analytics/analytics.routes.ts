import { Router } from 'express';
import { getAnalyticsHealthController, getDashboardController } from './analytics.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';

// Los diagnósticos son opcionales; el tablero exige identidad y autorización en el servicio.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAnalyticsHealthController);
  router.get('/dashboard', requireAuthentication, getDashboardController);
  return router;
}
