import { Router } from 'express';
import { getReportsHealthController, getOwnActivityReportController, createActivityReportController, createPhysicalgoodsReportController } from './reports.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { parseActivityId, parseEmptyActivityInput } from '../activities/activities.validation.js';
import { parseActivityReport, parseContentReport } from './reports.validation.js';
import type { ReportsDependencies } from './reports.types.js';
import { createDigitalReportController } from './reports.controller.js';
import { downloadReportedOriginalController, getReportReviewController, listReportReviewsController } from './reports.controller.js';
import { resolveReportController, listReportResolutionsController, getReportResolutionController } from './reports.controller.js';

/** Todas las denuncias de contenido se registran en reports, con autorización propia del elemento. */
export function createReportsRouter(diagnosticsEnabled: boolean, dependencies: ReportsDependencies = {}): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getReportsHealthController);
  router.get('/campuses/:campusId', requireAuthentication, listReportReviewsController);
  router.get('/campuses/:campusId/resolutions', requireAuthentication, listReportResolutionsController);
  router.get('/campuses/:campusId/resolutions/:reportId', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput }), getReportResolutionController);
  router.post('/campuses/:campusId/:reportId/resolution', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput }), resolveReportController);
  router.get('/campuses/:campusId/:reportId', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput }), getReportReviewController);
  router.get('/campuses/:campusId/:reportId/files/:fileId', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput }), downloadReportedOriginalController);

  router.get('/activities/:activityId/own', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseEmptyActivityInput }),
    getOwnActivityReportController(dependencies));
  router.post('/activities/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseActivityReport }),
    createActivityReportController(dependencies));
  router.post('/physicalgoods/:publicationId',requireAuthentication,
    validateRequest({query:parseEmptyActivityInput,body:parseContentReport}),createPhysicalgoodsReportController);
  router.post('/physicalgoods/:publicationId/transactions/:transactionId',requireAuthentication,
    validateRequest({query:parseEmptyActivityInput,body:parseContentReport}),createPhysicalgoodsReportController);
  router.post('/elibrary/:publicationId',requireAuthentication,validateRequest({query:parseEmptyActivityInput,body:parseContentReport}),createDigitalReportController);
  router.post('/elibrary/:publicationId/transactions/:transactionId',requireAuthentication,validateRequest({query:parseEmptyActivityInput,body:parseContentReport}),createDigitalReportController);
  return router;
}
