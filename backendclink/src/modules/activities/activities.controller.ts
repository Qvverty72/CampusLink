import type { RequestHandler } from 'express';
import type { AuthLocals } from '../auth/auth.types.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { getActivities, type ActivityDependencies } from './activities.service.js';
import type { ActivityQuery } from './activities.types.js';
import { getActivityDetail, joinActivity } from './activities.detail.service.js';
import { createCommunityActivity, createOfficialEvent } from './activities.create.service.js';
import type { CreateActivityInput } from './activities.types.js';
import type { CreateActivitySeriesInput } from './activities.types.js';
import { createActivitySeries, previewActivitySeries, getActivitySeries } from './activities.series.service.js';
import { editActivity, previewActivityEdit } from './activities.edit.service.js';
import type { ActivityEditDependencies, EditActivityInput } from './activities.edit.types.js';

export function createActivityEditController(dependencies: ActivityEditDependencies = {}, preview = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { body, params } = getValidatedRequest<{ body: EditActivityInput; params: { activityId: string } }>(response);
    sendSuccess(response, await (preview ? previewActivityEdit : editActivity)(response.locals.auth, params.activityId, body, dependencies));
  };
}

export function createActivitySeriesController(dependencies: ActivityDependencies = {}, official = false, preview = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { body } = getValidatedRequest<{ body: CreateActivitySeriesInput }>(response);
    sendSuccess(response, await (preview ? previewActivitySeries : createActivitySeries)(response.locals.auth, body, dependencies, official),
      { status: preview ? 200 : 201 });
  };
}

export function createActivitySeriesDetailController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params } = getValidatedRequest<{ params: { seriesId: string } }>(response);
    sendSuccess(response, await getActivitySeries(response.locals.auth, params.seriesId, dependencies));
  };
}

export function createActivityPublicationController(dependencies: ActivityDependencies = {}, official = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { body } = getValidatedRequest<{ body: CreateActivityInput }>(response);
    sendSuccess(response, await (official ? createOfficialEvent : createCommunityActivity)(response.locals.auth, body, dependencies), { status: 201 });
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
