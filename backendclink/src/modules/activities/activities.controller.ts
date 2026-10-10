import type { RequestHandler } from 'express';
import type { AuthLocals } from '../auth/auth.types.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { getActivities, type ActivityDependencies } from './activities.service.js';
import type { ActivityQuery } from './activities.types.js';
import { getActivityDetail, joinActivity } from './activities.detail.service.js';
import { createCommunityActivity } from './activities.create.service.js';
import type { CreateCommunityActivityInput } from './activities.types.js';

export function createCommunityActivityController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { body } = getValidatedRequest<{ body: CreateCommunityActivityInput }>(response);
    sendSuccess(response, await createCommunityActivity(response.locals.auth, body, dependencies), { status: 201 });
  };
}

export function createActivitiesController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { query } = getValidatedRequest<{ query: ActivityQuery }>(response);
    sendSuccess(response, await getActivities(response.locals.auth, query, dependencies));
  };
}

export function createActivityDetailController(dependencies: ActivityDependencies = {}, register = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params } = getValidatedRequest<{ params: { activityId: string } }>(response);
    sendSuccess(response, await (register ? joinActivity : getActivityDetail)(response.locals.auth, params.activityId, dependencies));
  };
}
