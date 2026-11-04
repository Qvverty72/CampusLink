import type {
  ApiErrorCode,
  ApiErrorCodeForStatus,
  ApiErrorDetail,
  ApiErrorStatus,
} from '../http/api.types.js';

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

/** Error HTTP previsto que puede devolverse al cliente; los errores 429 requieren plazo de reintento. */
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
