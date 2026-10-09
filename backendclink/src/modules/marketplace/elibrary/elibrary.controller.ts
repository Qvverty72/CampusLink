import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../services/health-response.js';
import { getElibraryHealth } from './elibrary.service.js';

export const getElibraryHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getElibraryHealth());
};
