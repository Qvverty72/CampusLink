import type { Response } from 'express';
import { ApiError } from './apiError.js';
import { sendApiError, sendSuccess as sendApiSuccess } from './apiResponse.js';
import type { ApiErrorCode, ApiErrorStatus } from '../types/api.js';

export { ApiError };

/** Compatibility facade for existing modules; all responses use the shared F2.2-04 helpers. */
export function sendSuccess<T>(
  response: Response,
  data: T,
  status: 200 | 201 | 202 | 204 = 200,
): void {
  sendApiSuccess(response, data, { status });
}

export function sendError(
  response: Response,
  status: ApiErrorStatus,
  code: ApiErrorCode,
  message: string,
): void {
  sendApiError(response, status, code, message);
}
