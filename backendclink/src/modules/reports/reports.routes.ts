import { Router } from 'express';
import { getReportsHealthController, createActivityReportController, createPhysicalgoodsReportController } from './reports.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { parseActivityId, parseEmptyActivityInput } from '../activities/activities.validation.js';
import { parseContentReport } from './reports.validation.js';
import type { ReportsDependencies } from './reports.types.js';

/** Todas las denuncias de contenido se registran en reports, con autorización propia del elemento. */
export function createReportsRouter(diagnosticsEnabled: boolean, dependencies: ReportsDependencies = {}): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getReportsHealthController);
  router.post('/activities/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseContentReport }),
    createActivityReportController(dependencies));
  router.post('/physicalgoods/:publicationId',requireAuthentication,
    validateRequest({query:parseEmptyActivityInput,body:parseContentReport}),createPhysicalgoodsReportController);
  router.post('/physicalgoods/:publicationId/transactions/:transactionId',requireAuthentication,
    validateRequest({query:parseEmptyActivityInput,body:parseContentReport}),createPhysicalgoodsReportController);
  return router;
}
