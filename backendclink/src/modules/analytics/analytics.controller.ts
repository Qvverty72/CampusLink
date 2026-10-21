import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getAnalyticsHealth } from './analytics.service.js';
import { sendSuccess } from '../../services/api-response.js';
import type { AuthLocals } from '../auth/auth.types.js';
import { getDashboard } from './analytics.dashboard.js';

export const getAnalyticsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAnalyticsHealth());
};

export const getDashboardController: RequestHandler<Record<string, string>, unknown, unknown, Record<string, unknown>, AuthLocals> =
  async (request, response) => {
    sendSuccess(response, await getDashboard(response.locals.auth, request.query));
  };
