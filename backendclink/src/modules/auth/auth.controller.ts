import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { completeInstitutionalRegistration, confirmInstitutionalRegistration, getAuthHealth, getRegistrationOptions, registerInstitutionalAccount, resendInstitutionalConfirmation } from './auth.service.js';
import { ApiError, sendSuccess } from '../../services/api-response.js';
import type { AuthLocals, IdentityLocals } from './auth.types.js';

export const confirmInstitutionalRegistrationController: RequestHandler = async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  sendSuccess(response, await confirmInstitutionalRegistration(request.body));
};
export const resendInstitutionalConfirmationController: RequestHandler = async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  sendSuccess(response, await resendInstitutionalConfirmation(request.body), 202);
};
export const completeInstitutionalRegistrationController: RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, IdentityLocals> =
  async (request, response) => {
    if (request.body !== undefined && (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length)) {
      throw new ApiError(400, 'INVALID_REGISTRATION', 'La finalización no acepta datos de perfil ni permisos.');
    }
    sendSuccess(response, await completeInstitutionalRegistration(response.locals.identity));
  };

export const getRegistrationOptionsController: RequestHandler = async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  sendSuccess(response, await getRegistrationOptions());
};

export const registerInstitutionalAccountController: RequestHandler = async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  sendSuccess(response, await registerInstitutionalAccount(request.body), 202);
};

export const getAuthHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAuthHealth());
};

export const getAuthIdentityController: RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> =
  (_request, response) => {
    sendSuccess(response, response.locals.auth);
  };
