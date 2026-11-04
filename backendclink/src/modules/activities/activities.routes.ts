import { createPolicyRouter } from '../../shared/http/endpoint-policy.js';
import type { Router } from 'express';
import type { OwnActivityDependencies } from './services/activities.mine.service.js';
import { createOwnActivitiesController } from './controllers/activities.controller.js';
import { requireAuthentication } from '../auth/middleware/auth.middleware.js';
import { validateRequest } from '../../shared/http/validate-request.js';
import { createActivitiesController, createActivityDetailController, createActivityPublicationController, createActivitySeriesController, createActivitySeriesDetailController, createActivityEditController } from './controllers/activities.controller.js';
import { activitySeriesParser, parseSeriesId } from './validators/activities.series.validation.js';
import { parseCreateActivity } from './validators/activities.create.validation.js';
import { parseActivityQuery, parseActivityId, parseEmptyActivityInput, parseActivityView } from './validators/activities.validation.js';
import type { ActivityEditDependencies } from './types/activities.edit.types.js';
import { editActivityParser } from './validators/activities.edit.validation.js';
import { createActivityParticipationController } from './controllers/activities.controller.js';
import { createActivityParticipantsController, createActivityDeletionController } from './controllers/activities.controller.js';
import { createCommunityActivityAvailabilityController } from './controllers/activities.controller.js';
import { createActivityViewController } from './controllers/activities.controller.js';
import { parseActivityParticipantsQuery, parseActivityDeletion } from './validators/activities.management.validation.js';

/** Registra lecturas y mutaciones de actividades con autenticación y validadores específicos por ruta. */
export function createActivitiesRouter(dependencies: ActivityEditDependencies & OwnActivityDependencies = {}): Router {
  const router = createPolicyRouter();
  router.get('/mine/count', requireAuthentication, validateRequest({ query: parseEmptyActivityInput, body: parseEmptyActivityInput }), createOwnActivitiesController(dependencies, true));
  router.get('/mine', requireAuthentication, createOwnActivitiesController(dependencies));
  router.post('/:activityId/interactions', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseActivityView }), createActivityViewController(dependencies));
  router.get('/community/creation-availability', requireAuthentication,
    validateRequest({ query: parseEmptyActivityInput, body: parseEmptyActivityInput }), createCommunityActivityAvailabilityController(dependencies));
  router.get('/:activityId/participants', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseActivityParticipantsQuery, body: parseEmptyActivityInput }),
    createActivityParticipantsController(dependencies));
  router.delete('/:activityId', requireAuthentication,
    validateRequest({ params: parseActivityId, query: parseEmptyActivityInput, body: parseActivityDeletion }),
    createActivityDeletionController(dependencies));
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
