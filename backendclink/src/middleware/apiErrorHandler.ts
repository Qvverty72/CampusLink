import type { ErrorRequestHandler } from 'express';

import { ApiError } from '../services/apiError.js';
import { sendApiError } from '../services/apiResponse.js';

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

function isPayloadTooLarge(error: unknown): error is BodyParserError {
  return error instanceof Error && 'type' in error && error.type === 'entity.too.large';
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
    sendApiError(response, 400, 'VALIDATION_ERROR', 'Request validation failed.', [
      { field: 'body', message: 'Request body must contain valid JSON.' },
    ]);
    return;
  }

  if (isPayloadTooLarge(error)) {
    sendApiError(response, 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
    return;
  }

  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    if (error.status === 500) {
      console.error('Unhandled API error', { errorName: getErrorName(error) });
      sendApiError(
        response,
        500,
        'INTERNAL_SERVER_ERROR',
        'Internal server error.',
      );
      return;
    }

    if (error.status === 503) {
      sendApiError(
        response,
        503,
        error.code,
        'Service temporarily unavailable.',
      );
      return;
    }

    sendApiError(response, error.status, error.code, error.message, error.details);
    return;
  }

  console.error('Unhandled API error', { errorName: getErrorName(error) });
  sendApiError(
    response,
    500,
    'INTERNAL_SERVER_ERROR',
    'Internal server error.',
  );
};
