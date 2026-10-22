import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getAnalyticsHealth, recordResourceView } from './analytics.service.js';
import type { AuthLocals } from '../auth/auth.types.js';
import { sendSuccess } from '../../services/api-response.js';
import { ApiError } from '../../services/api-response.js';

export const recordResourceViewController: RequestHandler<{publicationId:string},unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  if (Object.keys(request.query).length) throw new ApiError(400,'VALIDATION_ERROR','La vista no admite filtros.');
  sendSuccess(response,await recordResourceView(response.locals.auth,request.params.publicationId,request.body));
};

export const getAnalyticsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAnalyticsHealth());
};
