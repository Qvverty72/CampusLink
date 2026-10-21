import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getReportsHealth, getOwnActivityReport, reportActivity } from './reports.service.js';
import { sendSuccess } from '../../services/api-response.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import type { AuthLocals } from '../auth/auth.types.js';
import type { ReportActivityInput, ReportsDependencies } from './reports.types.js';
import { reportPhysicalgoods } from './reports.physicalgoods.service.js';
import { reportDigitalResource } from './reports.elibrary.service.js';

export const getReportsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getReportsHealth());
};

export const createPhysicalgoodsReportController:RequestHandler<Record<string,string>,unknown,unknown,Record<string,string>,AuthLocals>=async(request,response)=>{
  sendSuccess(response,await reportPhysicalgoods(response.locals.auth,request.params.publicationId,request.params.transactionId??null,request.body),201);
};
export const createDigitalReportController:RequestHandler<Record<string,string>,unknown,unknown,Record<string,string>,AuthLocals>=async(request,response)=>{
  sendSuccess(response,await reportDigitalResource(response.locals.auth,request.params.publicationId,request.params.transactionId??null,request.body),201);
};

/** Consulta únicamente el acuse del usuario autenticado en su campus actual. */
export function getOwnActivityReportController(dependencies: ReportsDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params } = getValidatedRequest<{ params: { activityId: string } }>(response);
    sendSuccess(response, await getOwnActivityReport(response.locals.auth, params.activityId, dependencies));
  };
}

/** Crea o recupera el acuse sin insertar nuevamente una denuncia ya enviada. */
export function createActivityReportController(dependencies: ReportsDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, body } = getValidatedRequest<{ params: { activityId: string }; body: ReportActivityInput }>(response);
    sendSuccess(response, await reportActivity(response.locals.auth, params.activityId, body, dependencies), 201);
  };
}
