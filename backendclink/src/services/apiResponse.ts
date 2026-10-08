import type { Response } from 'express';

import type { ApiSuccessBody } from '../types/api.js';

export interface SuccessResponseOptions<Meta extends object> {
  status?: 200 | 201 | 204;
  meta?: Meta;
}

/** Sends the shared success envelope; HTTP 204 intentionally has no body. */
export function sendSuccess<T, Meta extends object = Record<string, unknown>>(
  response: Response,
  data: T,
  options: SuccessResponseOptions<Meta> = {},
): Response<ApiSuccessBody<T, Meta> | undefined> {
  const status = options.status ?? 200;

  if (status === 204) {
    return response.status(204).end();
  }

  const body: ApiSuccessBody<T, Meta> = options.meta === undefined
    ? { data }
    : { data, meta: options.meta };

  return response.status(status).json(body);
}
