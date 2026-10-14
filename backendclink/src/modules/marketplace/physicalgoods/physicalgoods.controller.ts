import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../services/health-response.js';
import { getPhysicalgoodsHealth } from './physicalgoods.service.js';
import { createPhysicalgoods, getPhysicalgoodsOptions, getPhysicalgoodsPhoto } from './physicalgoods.service.js';
import { sendSuccess } from '../../../services/api-response.js';
import type { AuthLocals } from '../../auth/auth.types.js';

type PhysicalgoodsHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const getPhysicalgoodsOptionsController: PhysicalgoodsHandler = async (_request, response) => {
  sendSuccess(response, await getPhysicalgoodsOptions(response.locals.auth));
};
export const createPhysicalgoodsController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await createPhysicalgoods(response.locals.auth, request.body), 201);
};
export const getPhysicalgoodsPhotoController: PhysicalgoodsHandler = async (request, response) => {
  sendSuccess(response, await getPhysicalgoodsPhoto(response.locals.auth, request.params.publicationId));
};

export const getPhysicalgoodsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getPhysicalgoodsHealth());
};
