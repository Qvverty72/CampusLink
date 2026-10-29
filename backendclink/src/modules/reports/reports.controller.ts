import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../services/health-response.js';
import { getReportsHealth, getOwnActivityReport, reportActivity } from './reports.service.js';
import { sendSuccess } from '../../services/api-response.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import type { AuthLocals } from '../auth/auth.types.js';
import type { ReportActivityInput, ReportsDependencies } from './reports.types.js';
import { getOwnPhysicalgoodsReport,reportPhysicalgoods } from './reports.physicalgoods.service.js';
import { getOwnDigitalReport,reportDigitalResource } from './reports.elibrary.service.js';
import { getReportedImage, getReportedOriginal, getReportReview, listReportReviews, listReportResolutions, getReportResolution } from './reports.review.service.js';
import { sendSuccess as sendEnvelope } from '../../services/apiResponse.js';
import { resolveReport } from './reports.resolution.service.js';

type ReviewHandler = RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals>;
export const getOwnPhysicalgoodsReportController:ReviewHandler=async(request,response)=>{sendSuccess(response,await getOwnPhysicalgoodsReport(response.locals.auth,request.params.publicationId));};
export const getOwnDigitalReportController:ReviewHandler=async(request,response)=>{sendSuccess(response,await getOwnDigitalReport(response.locals.auth,request.params.publicationId));};
export const listReportResolutionsController: ReviewHandler = async (request, response) => {
  const result = await listReportResolutions(response.locals.auth, request.params.campusId, request.query);
  sendEnvelope(response, result.data, { meta: result.meta });
};
export const getReportResolutionController: ReviewHandler = async (request, response) => {
  sendSuccess(response, await getReportResolution(response.locals.auth, request.params.campusId, request.params.reportId));
};
export const resolveReportController: ReviewHandler = async (request, response) => {
  sendSuccess(response, await resolveReport(response.locals.auth, request.params.campusId, request.params.reportId, request.body));
};
export const listReportReviewsController: ReviewHandler = async (request, response) => {
  const result = await listReportReviews(response.locals.auth, request.params.campusId, request.query);
  sendEnvelope(response, result.data, { meta: result.meta });
};
export const getReportReviewController: ReviewHandler = async (request, response) => {
  sendSuccess(response, await getReportReview(response.locals.auth, request.params.campusId, request.params.reportId));
};
export const getReportedImageController: ReviewHandler = async (request, response) => {
  sendSuccess(response, await getReportedImage(response.locals.auth, request.params.campusId, request.params.reportId, request.params.imageId));
};
export const downloadReportedOriginalController: ReviewHandler = async (request, response) => {
  const file = await getReportedOriginal(response.locals.auth, request.params.campusId, request.params.reportId, request.params.fileId);
  const name = encodeURIComponent(file.name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16));
  response.setHeader('Content-Type', 'application/octet-stream');
  response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
  response.setHeader('Content-Length', file.bytes.length);
  response.send(file.bytes);
};

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
