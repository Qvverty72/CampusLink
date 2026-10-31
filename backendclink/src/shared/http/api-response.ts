import type { Response } from 'express';

import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiErrorDetail,
  ApiErrorStatus,
  ApiSuccessBody,
} from './api.types.js';

export interface SuccessResponseOptions<Meta extends object> {
  status?: 200 | 201 | 202 | 204;
  meta?: Meta;
}

/** Envía el sobre de éxito compartido; la respuesta HTTP 204 termina sin cuerpo. */
export function sendSuccess<T, Meta extends object = Record<string, unknown>>(
  response: Response,
  data: T,
  options: SuccessResponseOptions<Meta> | 200 | 201 | 202 | 204 = {},
): Response<ApiSuccessBody<T, Meta> | undefined> {
  const settings = typeof options === 'number' ? { status: options } : options;
  const status = settings.status ?? 200;

  if (status === 204) {
    return response.status(204).end();
  }

  const body: ApiSuccessBody<T, Meta> = settings.meta === undefined
    ? { data }
    : { data, meta: settings.meta };

  return response.status(status).json(body);
}

/** Envía el sobre de error usado tanto por la aplicación como por los diagnósticos. */
export function sendApiError(
  response: Response,
  status: ApiErrorStatus,
  code: ApiErrorCode,
  message: string,
  details?: ApiErrorDetail[],
): Response<ApiErrorBody> {
  const error = details === undefined ? { code, message } : { code, message, details };
  return response.status(status).json({ error });
}

/** Ambos nombres históricos usan exactamente el mismo serializador. */
export { sendApiError as sendError };
