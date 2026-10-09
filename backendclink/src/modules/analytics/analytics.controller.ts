import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getAnalyticsHealth } from './analytics.service.js';

export const getAnalyticsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAnalyticsHealth());
};
