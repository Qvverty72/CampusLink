import type { Response } from 'express';
import type { ApiErrorResponse, ApiSuccess } from '../types/api.types.js';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
export function sendSuccess<T>(response: Response, data: T, status = 200): void {
  response.status(status).json({ data } satisfies ApiSuccess<T>);
}
export function sendError(response: Response, status: number, code: string, message: string): void {
  response.status(status).json({ error: { code, message } } satisfies ApiErrorResponse);
}
