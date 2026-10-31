import { createPolicyRouter } from '../../shared/http/endpoint-policy.js';
import type { Router, RequestHandler } from 'express';
import { requireAuthentication } from '../auth/middleware/auth.middleware.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { sendSuccess } from '../../shared/http/api-response.js';
import { ownNotificationOperation } from './notifications.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Monta operaciones de notificaciones propias detrás del middleware de autenticación. */
export function createNotificationsRouter(operation = ownNotificationOperation): Router {
  const router = createPolicyRouter();
  const validateBody: RequestHandler = (request, _response, next) => {
    if (request.body !== undefined && (request.body === null || typeof request.body !== 'object'
      || Array.isArray(request.body) || Object.keys(request.body).length)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Esta operación no admite campos en el cuerpo.');
    }
    next();
  };
  router.get('/unread-count', requireAuthentication, validateBody, async (request, response) => {
    if (Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'El contador no admite filtros.');
    sendSuccess(response, await operation(response.locals.auth, { countOnly: true }));
  });
  router.get('/', requireAuthentication, validateBody, async (request, response) => {
    if (Object.keys(request.query).some(key => key !== 'cursor') || (request.query.cursor !== undefined
      && (typeof request.query.cursor !== 'string' || !uuid.test(request.query.cursor)))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor de notificaciones inválido.');
    }
    sendSuccess(response, await operation(response.locals.auth, { cursor: request.query.cursor as string | undefined }));
  });
  router.get('/:notificationId/activity-change', requireAuthentication, validateBody, async (request, response) => {
    const id = request.params.notificationId;
    if (!uuid.test(id) || Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Notificación inválida.');
    sendSuccess(response, await operation(response.locals.auth, { id: id.toLowerCase(), activityChange: true }));
  });
  for (const remove of [false, true]) {
    router[remove ? 'delete' : 'put'](remove ? '/:notificationId' : '/:notificationId/read', requireAuthentication, validateBody, async (request, response) => {
      const id = request.params.notificationId;
      if (!uuid.test(id) || Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Notificación inválida.');
      sendSuccess(response, await operation(response.locals.auth, { id: id.toLowerCase(), remove }));
    });
  }
  return router;
}
