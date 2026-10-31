import { createPolicyRouter } from '../../middleware/endpoint-policy.js';
import type { Router } from 'express';
import { getOwnActivities, type OwnActivityDependencies } from './activities.mine.service.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createActivitiesController, createActivityDetailController, createActivityPublicationController, createActivitySeriesController, createActivitySeriesDetailController, createActivityEditController } from './activities.controller.js';
import { activitySeriesParser, parseSeriesId } from './activities.series.validation.js';
import { parseCreateActivity } from './activities.create.validation.js';
import { parseActivityQuery, parseActivityId, parseEmptyActivityInput, parseActivityView } from './activities.validation.js';
import type { ActivityEditDependencies } from './activities.edit.types.js';
import { editActivityParser } from './activities.edit.validation.js';
import { createActivityParticipationController } from './activities.controller.js';
import { createActivityParticipantsController, createActivityDeletionController } from './activities.controller.js';
import { createCommunityActivityAvailabilityController } from './activities.controller.js';
import { createActivityViewController } from './activities.controller.js';
import { parseActivityParticipantsQuery, parseActivityDeletion } from './activities.management.validation.js';

/** Registra lecturas y mutaciones de actividades con autenticación y validadores específicos por ruta. */
export function createActivitiesRouter(dependencies: ActivityEditDependencies & OwnActivityDependencies = {}): Router {
  const router = createPolicyRouter();
  router.get('/mine/count', requireAuthentication, validateRequest({ query: parseEmptyActivityInput, body: parseEmptyActivityInput }), async (_request, response) => {
    const result = await getOwnActivities(response.locals.auth, { limit: '1' }, dependencies);
    sendSuccess(response, { campusId: result.campusId, total: result.total });
  });
  router.get('/mine', requireAuthentication, async (request, response) => {
    sendSuccess(response, await getOwnActivities(response.locals.auth, request.query, dependencies));
  });
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
