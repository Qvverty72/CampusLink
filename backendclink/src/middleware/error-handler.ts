import type { RequestHandler } from 'express';
import { apiErrorHandler } from './apiErrorHandler.js';
import { ApiError } from '../services/apiError.js';

/** Alias de compatibilidad atendidos por el único flujo de errores compartido. */
export const errorHandler = apiErrorHandler;

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Route not found.'));
};
