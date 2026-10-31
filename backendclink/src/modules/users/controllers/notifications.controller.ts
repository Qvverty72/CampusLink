import type { RequestHandler } from 'express';
import { sendSuccess } from '../../../shared/http/api-response.js';
import { ownNotificationOperation } from '../services/notifications.service.js';
import { parseNotificationCursor, parseNotificationId, validateNotificationCountQuery } from '../validators/notifications.validation.js';

/** Conserva la operación inyectable utilizada por el router y sus pruebas. */
export function createNotificationControllers(operation = ownNotificationOperation) {
  const count: RequestHandler = async (request, response) => {
    validateNotificationCountQuery(request.query);
    sendSuccess(response, await operation(response.locals.auth, { countOnly: true }));
  };
  const list: RequestHandler = async (request, response) => {
    sendSuccess(response, await operation(response.locals.auth, { cursor: parseNotificationCursor(request.query) }));
  };
  const activityChange: RequestHandler<Record<string, string>> = async (request, response) => {
    const id = parseNotificationId(request.params.notificationId, request.query);
    sendSuccess(response, await operation(response.locals.auth, { id, activityChange: true }));
  };
  const change = (remove: boolean): RequestHandler<Record<string, string>> => async (request, response) => {
    const id = parseNotificationId(request.params.notificationId, request.query);
    sendSuccess(response, await operation(response.locals.auth, { id, remove }));
  };
  return { count, list, activityChange, read: change(false), remove: change(true) };
}
