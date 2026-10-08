import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getReportsHealth } from './reports.service.js';

export const getReportsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getReportsHealth());
};
