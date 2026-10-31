import type { RequestHandler } from 'express';
import { sendModuleHealth } from '../../shared/health/health-response.js';
import { exportAnalyticalReport, generateAnalyticalReport, getAnalyticalReport, getAnalyticsHealth, getDashboard, getDashboardOptions, listHistoricalReports, recordResourceView } from './analytics.service.js';
import type { AuthLocals } from '../auth/types/auth.types.js';
import { sendSuccess } from '../../shared/http/api-response.js';
import { ApiError } from '../../shared/errors/api-error.js';

export const recordResourceViewController: RequestHandler<{publicationId:string},unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  if (Object.keys(request.query).length) throw new ApiError(400,'VALIDATION_ERROR','La vista no admite filtros.');
  sendSuccess(response,await recordResourceView(response.locals.auth,request.params.publicationId,request.body));
};

export const getAnalyticsHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getAnalyticsHealth());
};

export const listHistoricalReportsController: RequestHandler<Record<string,string>,unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  sendSuccess(response, await listHistoricalReports(response.locals.auth, request.query));
};

export const getDashboardController: RequestHandler<Record<string,string>,unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  sendSuccess(response, await getDashboard(response.locals.auth, request.query));
};

export const generateAnalyticalReportController: RequestHandler<Record<string,string>,unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  if (Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Envía los filtros del reporte solo en el cuerpo.');
  sendSuccess(response, await generateAnalyticalReport(response.locals.auth, request.body));
};

export const getAnalyticalReportController: RequestHandler<{reportId:string},unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  if (Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'La consulta del reporte guardado no admite filtros.');
  sendSuccess(response, await getAnalyticalReport(response.locals.auth, request.params.reportId));
};

export const getDashboardOptionsController: RequestHandler<Record<string,string>,unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  if (Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'La consulta de opciones no admite filtros.');
  sendSuccess(response, await getDashboardOptions(response.locals.auth));
};

export const exportAnalyticalReportController: RequestHandler<{reportId:string;format:string},unknown,unknown,Record<string,string>,AuthLocals> = async (request,response) => {
  if (Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'La exportación del reporte guardado no admite filtros.');
  const file = await exportAnalyticalReport(response.locals.auth, request.params.reportId, request.params.format);
  response.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Access-Control-Expose-Headers': 'Content-Disposition', 'Cache-Control': 'no-store' });
  response.send(file.bytes);
};
