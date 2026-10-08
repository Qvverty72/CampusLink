import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getAuthHealth } from './auth.service.js';

export const getAuthHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAuthHealth());
};
