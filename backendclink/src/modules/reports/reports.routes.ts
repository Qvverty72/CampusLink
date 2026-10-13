import { Router } from 'express';
import { getReportsHealthController, createActivityReportController, createContentReportController } from './reports.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { parseActivityId, parseEmptyActivityInput } from '../activities/activities.validation.js';
import { parseActivityReport, parseContentReport } from './reports.validation.js';
import type { ReportsDependencies } from './reports.types.js';
import type { ReviewDependencies } from './reports.review.types.js';
import { parseReviewParams, parseReviewQuery } from './reports.review.validation.js';
import { reviewControllers } from './reports.review.controller.js';

export function createReportsRouter(diagnosticsEnabled: boolean, dependencies: ReportsDependencies = {}, reviewDependencies: ReviewDependencies = {}): Router {
  const router = Router();
  const review = reviewControllers(reviewDependencies);
  if (diagnosticsEnabled) router.get('/health', getReportsHealthController);
  router.get('/campuses', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput }), review.campuses);
  router.get('/campuses/:campusId', requireAuthentication,
    validateRequest({ params: parseReviewParams, query: parseReviewQuery }), review.list);
  router.get('/campuses/:campusId/:reportId', requireAuthentication,
    validateRequest({ params: parseReviewParams, query: parseEmptyActivityInput }), review.detail);
  router.post('/', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput, body: parseContentReport }),
    createContentReportController(dependencies));
  router.post('/activities/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseActivityReport }),
    createActivityReportController(dependencies));
  return router;
}
