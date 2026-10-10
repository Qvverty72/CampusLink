import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getReportsHealth, reportActivity } from './reports.service.js';
import { sendSuccess } from '../../services/api-response.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import type { AuthLocals } from '../auth/auth.types.js';
import type { ReportActivityInput, ReportsDependencies } from './reports.types.js';

export const getReportsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getReportsHealth());
};

export function createActivityReportController(dependencies: ReportsDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, body } = getValidatedRequest<{ params: { activityId: string }; body: ReportActivityInput }>(response);
    sendSuccess(response, await reportActivity(response.locals.auth, params.activityId, body, dependencies), 201);
  };
}
