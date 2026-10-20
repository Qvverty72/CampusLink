import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../../services/health-response.js';
import { getElibraryHealth } from './elibrary.service.js';
import { authorizeDigitalAccess, createDigitalPublication, getDigitalPublications } from './elibrary.service.js';
import { sendSuccess } from '../../../services/api-response.js';
import type { AuthLocals } from '../../auth/auth.types.js';
import { readDigitalUpload } from './elibrary.upload.js';
import { addDigitalAttachment, getDigitalOriginal } from './elibrary.files.service.js';
import { getDigitalAcademicCatalog, updateDigitalAcademics } from './elibrary.academics.service.js';
import { invalidDigital } from './elibrary.validation.js';

type DigitalHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const digitalAcademicCatalogController: DigitalHandler = async (request, response) => {
  if (Object.keys(request.query).length) invalidDigital('query', 'La consulta no admite parámetros adicionales.');
  sendSuccess(response, await getDigitalAcademicCatalog(response.locals.auth));
};
export const updateDigitalAcademicsController: DigitalHandler = async (request, response) => {
  if (Object.keys(request.query).length) invalidDigital('query', 'La solicitud no admite parámetros adicionales.');
  sendSuccess(response, await updateDigitalAcademics(response.locals.auth, request.params.publicationId, request.body));
};
export const addDigitalFileController: DigitalHandler = async (request, response) => {
  authorizeDigitalAccess(response.locals.auth);
  const { file } = await readDigitalUpload(request, false);
  sendSuccess(response, await addDigitalAttachment(response.locals.auth, request.params.publicationId, file), 201);
};
export const downloadDigitalFileController: DigitalHandler = async (request, response) => {
  const file = await getDigitalOriginal(response.locals.auth, request.params.publicationId, request.params.fileId);
  const name = encodeURIComponent(file.name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16));
  response.setHeader('Content-Type', 'application/octet-stream');
  response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
  response.setHeader('Content-Length', file.bytes.length);
  response.send(file.bytes);
};
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
