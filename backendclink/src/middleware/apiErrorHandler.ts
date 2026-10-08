import type { ErrorRequestHandler, Response } from 'express';

import { ApiError } from '../services/apiError.js';
import type { ApiErrorBody, ApiErrorCode, ApiErrorStatus } from '../types/api.js';

interface BodyParserError extends Error {
  type?: string;
}

function isInvalidJson(error: unknown): error is BodyParserError {
  return (
    error instanceof Error &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function sendError(
  response: Response,
  status: ApiErrorStatus,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorBody['error']['details'],
): void {
  const error = details === undefined
    ? { code, message }
    : { code, message, details };

  response.status(status).json({ error });
}

/** Converts thrown application and parser errors to the public API contract. */
export const apiErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isInvalidJson(error)) {
    sendError(response, 400, 'VALIDATION_ERROR', 'Request validation failed.', [
      { field: 'body', message: 'Request body must contain valid JSON.' },
    ]);
    return;
  }

  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    if (error.status === 500) {
      console.error('Unhandled API error', { errorName: getErrorName(error) });
      sendError(
        response,
        500,
        'INTERNAL_SERVER_ERROR',
        'Internal server error.',
      );
      return;
    }

    if (error.status === 503) {
      sendError(
        response,
        503,
        'SERVICE_UNAVAILABLE',
        'Service temporarily unavailable.',
      );
      return;
    }

    sendError(response, error.status, error.code, error.message, error.details);
    return;
  }

  console.error('Unhandled API error', { errorName: getErrorName(error) });
  sendError(
    response,
    500,
    'INTERNAL_SERVER_ERROR',
    'Internal server error.',
  );
};
