import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getAuthHealth } from './auth.service.js';
import { sendSuccess } from '../../services/api-response.js';
import type { AuthLocals } from './auth.types.js';

export const getAuthHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAuthHealth());
};

export const getAuthIdentityController: RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> =
  (_request, response) => {
    sendSuccess(response, response.locals.auth);
  };
