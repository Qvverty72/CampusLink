import { Router } from 'express';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createActivitiesController, createActivityDetailController, createActivityPublicationController, createActivitySeriesController, createActivitySeriesDetailController, createActivityEditController } from './activities.controller.js';
import { activitySeriesParser, parseSeriesId } from './activities.series.validation.js';
import { parseCreateActivity } from './activities.create.validation.js';
import { parseActivityQuery, parseActivityId, parseEmptyActivityInput } from './activities.validation.js';
import type { ActivityEditDependencies } from './activities.edit.types.js';
import { editActivityParser } from './activities.edit.validation.js';
import { createActivityParticipationController } from './activities.controller.js';

export function createActivitiesRouter(dependencies: ActivityEditDependencies = {}): Router {
  const router = Router();
  router.post('/:activityId/edit/preview', requireAuthentication, validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: editActivityParser() }),
    createActivityEditController(dependencies, true));
  router.patch('/:activityId', requireAuthentication, validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: editActivityParser(true) }),
    createActivityEditController(dependencies));
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
  router.get('/:activityId/participation', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseEmptyActivityInput }),
    createActivityParticipationController(dependencies));
  router.delete('/:activityId/participation', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseEmptyActivityInput }),
    createActivityParticipationController(dependencies, true));
  return router;
}
