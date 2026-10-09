import type { RequestHandler } from 'express';
import { apiErrorHandler } from './apiErrorHandler.js';
import { ApiError } from '../services/apiError.js';

/** Backwards-compatible names backed by the single F2.2-04 error pipeline. */
export const errorHandler = apiErrorHandler;

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Route not found.'));
};
