import { Router } from 'express';
import { getAnalyticsHealthController } from './analytics.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createAnalyticsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAnalyticsHealthController);
  return router;
}
