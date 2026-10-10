import { Router } from 'express';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createActivitiesController } from './activities.controller.js';
import { parseActivityQuery } from './activities.validation.js';
import type { ActivityDependencies } from './activities.service.js';

export function createActivitiesRouter(dependencies: ActivityDependencies = {}): Router {
  const router = Router();
  router.get('/', requireAuthentication, validateRequest({ query: parseActivityQuery }), createActivitiesController(dependencies));
  return router;
}
