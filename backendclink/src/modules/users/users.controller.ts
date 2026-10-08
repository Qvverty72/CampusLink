import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getUsersHealth } from './users.service.js';

export const getUsersHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getUsersHealth());
};
