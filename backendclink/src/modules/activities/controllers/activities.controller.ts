import type { RequestHandler } from 'express';
import { getOwnActivities, type OwnActivityDependencies } from '../services/activities.mine.service.js';
import type { AuthLocals } from '../../auth/types/auth.types.js';
import { getValidatedRequest } from '../../../shared/http/validate-request.js';
import { sendSuccess } from '../../../shared/http/api-response.js';
import { getActivities, type ActivityDependencies } from '../services/activities.service.js';
import type { ActivityQuery } from '../types/activities.types.js';
import { getActivityDetail, joinActivity } from '../services/activities.detail.service.js';
import { recordViewedActivity } from '../services/activities.detail.service.js';
import { participationOperationId } from '../validators/activities.validation.js';
import { getOwnActivityParticipation, leaveActivity } from '../services/activities.detail.service.js';
import { createCommunityActivity, createOfficialEvent, getCommunityActivityCreationAvailability } from '../services/activities.create.service.js';
import type { CreateActivityInput } from '../types/activities.types.js';
import type { CreateActivitySeriesInput } from '../types/activities.types.js';
import { createActivitySeries, previewActivitySeries, getActivitySeries } from '../services/activities.series.service.js';
import { editActivity, previewActivityEdit } from '../services/activities.edit.service.js';
import type { ActivityEditDependencies, EditActivityInput } from '../types/activities.edit.types.js';
import { getActivityParticipants, deleteOwnActivity } from '../services/activities.management.service.js';
import type { ActivityParticipantsQuery } from '../types/activities.types.js';
/** Adapta las consultas propias sin introducir lógica de negocio en las rutas. */
export function createOwnActivitiesController(dependencies: OwnActivityDependencies = {}, countOnly = false): RequestHandler {
  return async (request, response) => {
    const result = await getOwnActivities(response.locals.auth, countOnly ? { limit: '1' } : request.query, dependencies);
    sendSuccess(response, countOnly ? { campusId: result.campusId, total: result.total } : result);
  };
}

/** Adapta el listado paginado de participantes al sobre HTTP común. */
export function createActivityParticipantsController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, query } = getValidatedRequest<{ params: { activityId: string }; query: ActivityParticipantsQuery }>(response);
    sendSuccess(response, await getActivityParticipants(response.locals.auth, params.activityId, query, dependencies));
  };
}

/** Adapta la retirada lógica del propietario usando la revisión esperada. */
export function createActivityDeletionController(dependencies: ActivityDependencies = {}): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { params, body } = getValidatedRequest<{ params: { activityId: string }; body: { expectedRevision: number } }>(response);
    sendSuccess(response, await deleteOwnActivity(response.locals.auth, params.activityId, body.expectedRevision, dependencies));
  };
}

/** Comparte el controlador de vista previa y guardado; la ruta decide cuál servicio se ejecuta. */
export function createActivityEditController(dependencies: ActivityEditDependencies = {}, preview = false): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const { body, params } = getValidatedRequest<{ body: EditActivityInput; params: { activityId: string } }>(response);
    sendSuccess(response, await (preview ? previewActivityEdit : editActivity)(response.locals.auth, params.activityId, body, dependencies));
  };
}

/** Publica una serie o su vista previa; el tipo oficial lo determina la ruta, no el cuerpo. */
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
