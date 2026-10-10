import { Router } from 'express';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createActivitiesController, createActivityDetailController, createCommunityActivityController } from './activities.controller.js';
import { parseCreateCommunityActivity } from './activities.create.validation.js';
import { parseActivityQuery, parseActivityId, parseEmptyActivityInput } from './activities.validation.js';
import type { ActivityDependencies } from './activities.service.js';

export function createActivitiesRouter(dependencies: ActivityDependencies = {}): Router {
  const router = Router();
  router.post('/', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput, body: parseCreateCommunityActivity }), createCommunityActivityController(dependencies));
  router.get('/', requireAuthentication, validateRequest({ query: parseActivityQuery }), createActivitiesController(dependencies));
  router.get('/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput }), createActivityDetailController(dependencies));
  router.put('/:activityId/participation', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseEmptyActivityInput }),
    createActivityDetailController(dependencies, true));
  return router;
}
