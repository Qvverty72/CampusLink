import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError, sendError } from '../services/api-response.js';

export const notFoundHandler: RequestHandler = (_request, response) => {
  sendError(response, 404, 'NOT_FOUND', 'Route not found');
};
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) { next(error); return; }
  if (error instanceof ApiError) {
    sendError(response, error.status, error.code, error.message);
    return;
  }
  const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
  if (type === 'entity.parse.failed') {
    sendError(response, 400, 'INVALID_JSON', 'Request body must contain valid JSON');
  } else if (type === 'entity.too.large') {
    sendError(response, 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit');
  } else {
    console.error('Unhandled API error');
    sendError(response, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
