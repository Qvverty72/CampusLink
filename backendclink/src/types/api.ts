export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RATE_LIMITED'
  | 'INVALID_REGISTRATION'
  | 'INVALID_INSTITUTIONAL_CAMPUS'
  | 'INVALID_VERIFICATION'
  | 'REGISTRATION_REQUIRED'
  | 'ADMISSION_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE';

export type ApiErrorCodeForStatus = {
  400: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'INVALID_REGISTRATION' | 'INVALID_INSTITUTIONAL_CAMPUS' | 'INVALID_VERIFICATION';
  401: 'UNAUTHENTICATED';
  403: 'FORBIDDEN' | 'REGISTRATION_REQUIRED' | 'ADMISSION_UNAVAILABLE';
  404: 'NOT_FOUND';
  409: 'CONFLICT';
  413: 'PAYLOAD_TOO_LARGE';
  429: 'RATE_LIMIT_EXCEEDED' | 'RATE_LIMITED';
  500: 'INTERNAL_SERVER_ERROR';
  503: 'SERVICE_UNAVAILABLE' | 'DEPENDENCY_UNAVAILABLE';
};

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export type ApiSuccessBody<T, Meta extends object = Record<string, unknown>> = {
  data: T;
  meta?: Meta;
};

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  hasMore: boolean;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ApiErrorDetail[] };

export type RequestSection = 'params' | 'query' | 'body';

export type RequestParser = (input: unknown) => ValidationResult<unknown>;

export type ValidatedRequest = Partial<Record<RequestSection, unknown>>;
