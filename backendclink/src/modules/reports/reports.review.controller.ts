import type { RequestHandler } from 'express';
import type { AuthLocals } from '../auth/auth.types.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { getReviewReport, listReviewCampuses, listReviewReports } from './reports.review.service.js';
import type { ReviewDependencies } from './reports.review.types.js';

type Handler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, unknown>, AuthLocals>;
export function reviewControllers(dependencies: ReviewDependencies = {}): { campuses: Handler; list: Handler; detail: Handler } {
  return {
    campuses: async (_request, response) => { sendSuccess(response, await listReviewCampuses(response.locals.auth, dependencies)); },
    list: async (request, response) => {
      const { params } = getValidatedRequest<{ params: { campusId: string } }>(response);
      const result = await listReviewReports(response.locals.auth, params.campusId, request.query, dependencies);
      sendSuccess(response, result.data, { meta: result.meta });
    },
    detail: async (_request, response) => {
      const { params } = getValidatedRequest<{ params: { campusId: string; reportId: string } }>(response);
      sendSuccess(response, await getReviewReport(response.locals.auth, params.campusId, params.reportId, dependencies));
    },
  };
}
