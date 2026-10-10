import { Router } from 'express';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { ApiError } from '../../services/apiError.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { ownNotificationOperation } from './notifications.service.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createNotificationsRouter(operation = ownNotificationOperation): Router {
  const router = Router();
  router.use(requireAuthentication);
  router.use((request, _response, next) => {
    if (request.body !== undefined && (request.body === null || typeof request.body !== 'object'
      || Array.isArray(request.body) || Object.keys(request.body).length)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Esta operación no admite campos en el cuerpo.');
    }
    next();
  });
  router.get('/', async (request, response) => {
    if (Object.keys(request.query).some(key => key !== 'cursor') || (request.query.cursor !== undefined
      && (typeof request.query.cursor !== 'string' || !uuid.test(request.query.cursor)))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor de notificaciones inválido.');
    }
    sendSuccess(response, await operation(response.locals.auth, { cursor: request.query.cursor as string | undefined }));
  });
  for (const remove of [false, true]) {
    router[remove ? 'delete' : 'put'](remove ? '/:notificationId' : '/:notificationId/read', async (request, response) => {
      const id = request.params.notificationId;
      if (!uuid.test(id) || Object.keys(request.query).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Notificación inválida.');
      sendSuccess(response, await operation(response.locals.auth, { id: id.toLowerCase(), remove }));
    });
  }
  return router;
}
