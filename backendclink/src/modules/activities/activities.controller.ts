import type { RequestHandler } from 'express';
import type { AuthLocals } from '../auth/auth.types.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { getActivities, type ActivityDependencies } from './activities.service.js';
import type { ActivityQuery } from './activities.types.js';
import { getActivityDetail, joinActivity } from './activities.detail.service.js';
import { recordViewedActivity } from './activities.detail.service.js';
import { ApiError } from '../../services/apiError.js';

function participationOperationId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Idempotency-Key debe ser un UUID válido.');
  }
  return value.toLowerCase();
}
import { getOwnActivityParticipation, leaveActivity } from './activities.detail.service.js';
import { createCommunityActivity, createOfficialEvent, getCommunityActivityCreationAvailability } from './activities.create.service.js';
import type { CreateActivityInput } from './activities.types.js';
import type { CreateActivitySeriesInput } from './activities.types.js';
import { createActivitySeries, previewActivitySeries, getActivitySeries } from './activities.series.service.js';
import { editActivity, previewActivityEdit } from './activities.edit.service.js';
import type { ActivityEditDependencies, EditActivityInput } from './activities.edit.types.js';
import { getActivityParticipants, deleteOwnActivity } from './activities.management.service.js';
import type { ActivityParticipantsQuery } from './activities.types.js';

export function createActivityParticipantsController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, query } = getValidatedRequest<{ params: { activityId: string }; query: ActivityParticipantsQuery }>(response);
    sendSuccess(response, await getActivityParticipants(response.locals.auth, params.activityId, query, dependencies));
  };
}

export function createActivityDeletionController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, body } = getValidatedRequest<{ params: { activityId: string }; body: { expectedRevision: number } }>(response);
    sendSuccess(response, await deleteOwnActivity(response.locals.auth, params.activityId, body.expectedRevision, dependencies));
  };
}

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

export function createCommunityActivityAvailabilityController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    sendSuccess(response, await getCommunityActivityCreationAvailability(response.locals.auth, dependencies));
  };
}

export function createActivitiesController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { query } = getValidatedRequest<{ query: ActivityQuery }>(response);
    sendSuccess(response, await getActivities(response.locals.auth, query, dependencies));
  };
}

export function createActivityDetailController(dependencies: ActivityDependencies = {}, register = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (request, response) => {
    const { params } = getValidatedRequest<{ params: { activityId: string } }>(response);
    sendSuccess(response, register ? await joinActivity(response.locals.auth, params.activityId, dependencies, participationOperationId(request.headers['idempotency-key']))
      : await getActivityDetail(response.locals.auth, params.activityId, dependencies));
  };
}

export function createActivityParticipationController(dependencies: ActivityDependencies = {}, withdraw = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (request, response) => {
    const { params } = getValidatedRequest<{ params: { activityId: string } }>(response);
    sendSuccess(response, withdraw ? await leaveActivity(response.locals.auth, params.activityId, dependencies, participationOperationId(request.headers['idempotency-key']))
      : await getOwnActivityParticipation(response.locals.auth, params.activityId, dependencies));
  };
}

export function createActivityViewController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, body } = getValidatedRequest<{ params: { activityId: string }; body: { operationId: string } }>(response);
    sendSuccess(response, await recordViewedActivity(response.locals.auth, params.activityId, body.operationId, dependencies));
  };
}
