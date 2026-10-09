import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getUsersHealth } from './users.service.js';
import { getAcademicProfile, getAcademicOptions, updateAcademicProfile } from './users.service.js';
import { sendSuccess } from '../../services/api-response.js';
import type { AuthLocals } from '../auth/auth.types.js';

type ProfileHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const getAcademicProfileController: ProfileHandler = async (_request, response) => {
  sendSuccess(response, await getAcademicProfile(response.locals.auth));
};
export const getAcademicOptionsController: ProfileHandler = async (_request, response) => {
  sendSuccess(response, await getAcademicOptions(response.locals.auth));
};
export const updateAcademicProfileController: ProfileHandler = async (request, response) => {
  sendSuccess(response, await updateAcademicProfile(response.locals.auth, request.body));
};

export const getUsersHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getUsersHealth());
};
