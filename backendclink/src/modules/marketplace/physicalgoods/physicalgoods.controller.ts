import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../services/health-response.js';
import { getPhysicalgoodsHealth } from './physicalgoods.service.js';

export const getPhysicalgoodsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getPhysicalgoodsHealth());
};
