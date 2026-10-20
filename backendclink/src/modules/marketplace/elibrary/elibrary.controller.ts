import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../services/health-response.js';
import { getElibraryHealth } from './elibrary.service.js';
import { authorizeDigitalAccess, createDigitalPublication, getDigitalPublications } from './elibrary.service.js';
import { sendSuccess } from '../../../services/api-response.js';
import type { AuthLocals } from '../../auth/auth.types.js';
import { readDigitalUpload } from './elibrary.upload.js';

type DigitalHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const createDigitalController: DigitalHandler = async (request, response) => {
  authorizeDigitalAccess(response.locals.auth);
  const { metadata, file } = await readDigitalUpload(request);
  sendSuccess(response, await createDigitalPublication(response.locals.auth, metadata, file), 201);
};
export const listDigitalController: DigitalHandler = async (_request, response) => {
  sendSuccess(response, await getDigitalPublications(response.locals.auth));
};
export const detailDigitalController: DigitalHandler = async (request, response) => {
  sendSuccess(response, (await getDigitalPublications(response.locals.auth, request.params.publicationId))[0]);
};

export const getElibraryHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getElibraryHealth());
};
