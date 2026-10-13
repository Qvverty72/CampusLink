import { Router } from 'express';
import { getReportsHealthController, createActivityReportController } from './reports.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { parseActivityId, parseEmptyActivityInput } from '../activities/activities.validation.js';
import { parseActivityReport } from './reports.validation.js';
import type { ReportsDependencies } from './reports.types.js';

export function createReportsRouter(diagnosticsEnabled: boolean, dependencies: ReportsDependencies = {}): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getReportsHealthController);
  router.post('/activities/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseActivityReport }),
    createActivityReportController(dependencies));
  return router;
}
