import { Router } from 'express';
import { getAnalyticsHealthController } from './analytics.controller.js';

// Solo expone diagnósticos técnicos; las rutas de negocio deberán definir autenticación y autorización.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAnalyticsHealthController);
  return router;
}
