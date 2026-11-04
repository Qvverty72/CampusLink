import type { Router } from 'express';
import { createPolicyRouter } from '../../shared/http/endpoint-policy.js';
import { requireAuthentication } from '../auth/middleware/auth.middleware.js';
import { createNotificationControllers } from './controllers/notifications.controller.js';
import { ownNotificationOperation } from './services/notifications.service.js';
import { validateNotificationBody } from './validators/notifications.validation.js';

/** Monta operaciones de notificaciones propias detrás del middleware de autenticación. */
export function createNotificationsRouter(operation = ownNotificationOperation): Router {
  const router = createPolicyRouter();
  const controller = createNotificationControllers(operation);
  router.get('/unread-count', requireAuthentication, validateNotificationBody, controller.count);
  router.get('/', requireAuthentication, validateNotificationBody, controller.list);
  router.get('/:notificationId/activity-change', requireAuthentication, validateNotificationBody, controller.activityChange);
  router.put('/:notificationId/read', requireAuthentication, validateNotificationBody, controller.read);
  router.delete('/:notificationId', requireAuthentication, validateNotificationBody, controller.remove);
  return router;
}
