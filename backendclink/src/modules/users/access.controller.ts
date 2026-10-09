import type { RequestHandler } from 'express';
import type { AuthLocals } from '../auth/auth.types.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { getAccessCampuses, getAccessCatalog, listAccessUsers, getUserAccess, updateUserAccess, updateAccountState } from './access.service.js';
import { listAuditEntries, getAuditEntry } from './access.service.js';

type Handler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, unknown>, AuthLocals>;
export const getAccessCampusesController: Handler = async (_request, response) => {
  sendSuccess(response, await getAccessCampuses(response.locals.auth));
};
export const getAccessCatalogController: Handler = async (request, response) => {
  sendSuccess(response, await getAccessCatalog(response.locals.auth, request.params.campusId));
};
export const listAccessUsersController: Handler = async (request, response) => {
  const result = await listAccessUsers(response.locals.auth, request.params.campusId, request.query);
  sendSuccess(response, result.data, { meta: result.meta });
};
export const getUserAccessController: Handler = async (request, response) => {
  sendSuccess(response, await getUserAccess(response.locals.auth, request.params.campusId, request.params.userId));
};
export const updateUserAccessController: Handler = async (request, response) => {
  sendSuccess(response, await updateUserAccess(response.locals.auth, request.params.campusId, request.params.userId, request.body));
};
export const updateAccountStateController: Handler = async (request, response) => {
  sendSuccess(response, await updateAccountState(response.locals.auth, request.params.campusId, request.params.userId, request.body));
};
export const listAuditEntriesController: Handler = async (request, response) => {
  const result = await listAuditEntries(response.locals.auth, request.params.campusId, request.query);
  sendSuccess(response,result.data,{ meta: result.meta });
};
export const getAuditEntryController: Handler = async (request, response) => {
  sendSuccess(response,await getAuditEntry(response.locals.auth,request.params.campusId,request.params.auditId));
};
