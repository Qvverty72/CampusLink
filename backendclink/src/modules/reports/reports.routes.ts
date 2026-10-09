import { Router } from 'express';
import { getReportsHealthController } from './reports.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createReportsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getReportsHealthController);
  return router;
}
