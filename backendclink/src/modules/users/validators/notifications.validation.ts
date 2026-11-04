import type { RequestHandler } from 'express';
import { ApiError } from '../../../shared/errors/api-error.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validateNotificationBody: RequestHandler = (request, _response, next) => {
  if (request.body !== undefined && (request.body === null || typeof request.body !== 'object'
    || Array.isArray(request.body) || Object.keys(request.body).length)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Esta operación no admite campos en el cuerpo.');
  }
  next();
};

export function validateNotificationCountQuery(query: Record<string, unknown>): void {
  if (Object.keys(query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'El contador no admite filtros.');
}

export function parseNotificationCursor(query: Record<string, unknown>): string | undefined {
  if (Object.keys(query).some(key => key !== 'cursor') || (query.cursor !== undefined
    && (typeof query.cursor !== 'string' || !uuid.test(query.cursor)))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor de notificaciones inválido.');
  }
  return query.cursor as string | undefined;
}

export function parseNotificationId(id: string, query: Record<string, unknown>): string {
  if (!uuid.test(id) || Object.keys(query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Notificación inválida.');
  return id.toLowerCase();
}
