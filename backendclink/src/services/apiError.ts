import type {
  ApiErrorCode,
  ApiErrorCodeForStatus,
  ApiErrorDetail,
  ApiErrorStatus,
} from '../types/api.js';

export interface ApiErrorOptions {
  details?: ApiErrorDetail[];
  retryAfterSeconds?: number;
}

type ApiErrorArguments = {
  [Status in ApiErrorStatus]: [
    status: Status,
    code: ApiErrorCodeForStatus[Status],
    message: string,
    options?: ApiErrorOptions,
  ];
}[ApiErrorStatus];

/** An expected HTTP error that can safely be returned to the API client. */
export class ApiError extends Error {
  readonly status: ApiErrorStatus;
  readonly code: ApiErrorCode;
  readonly details?: ApiErrorDetail[];
  readonly retryAfterSeconds?: number;

  constructor(...args: ApiErrorArguments) {
    const [status, code, message, options = {}] = args;
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options.details;

    if (status === 429) {
      const retryAfterSeconds = options.retryAfterSeconds;
      if (
        retryAfterSeconds === undefined ||
        !Number.isSafeInteger(retryAfterSeconds) ||
        retryAfterSeconds < 0
      ) {
        throw new RangeError(
          'HTTP 429 errors require a non-negative integer retryAfterSeconds.',
        );
      }
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
}
