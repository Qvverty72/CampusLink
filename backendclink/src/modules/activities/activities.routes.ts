import { Router } from 'express';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createActivitiesController, createActivityDetailController, createActivityPublicationController, createActivitySeriesController, createActivitySeriesDetailController } from './activities.controller.js';
import { activitySeriesParser, parseSeriesId } from './activities.series.validation.js';
import { parseCreateActivity } from './activities.create.validation.js';
import { parseActivityQuery, parseActivityId, parseEmptyActivityInput } from './activities.validation.js';
import type { ActivityDependencies } from './activities.service.js';

export function createActivitiesRouter(dependencies: ActivityDependencies = {}): Router {
  const router = Router();
  for (const official of [false, true]) {
    const path = official ? '/series/official' : '/series';
    router.post(`${path}/preview`, requireAuthentication, validateRequest({ query: parseEmptyActivityInput, body: activitySeriesParser() }),
      createActivitySeriesController(dependencies, official, true));
    router.post(path, requireAuthentication, validateRequest({ query: parseEmptyActivityInput, body: activitySeriesParser(true) }),
      createActivitySeriesController(dependencies, official));
  }
  router.get('/series/:seriesId', requireAuthentication, validateRequest({ params: parseSeriesId, query: parseEmptyActivityInput }),
    createActivitySeriesDetailController(dependencies));
  router.post('/', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput, body: parseCreateActivity }), createActivityPublicationController(dependencies));
  router.post('/official', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput, body: parseCreateActivity }), createActivityPublicationController(dependencies, true));
  router.get('/', requireAuthentication, validateRequest({ query: parseActivityQuery }), createActivitiesController(dependencies));
  router.get('/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput }), createActivityDetailController(dependencies));
  router.put('/:activityId/participation', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseEmptyActivityInput }),
    createActivityDetailController(dependencies, true));
  return router;
}
