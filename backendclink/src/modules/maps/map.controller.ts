import type { RequestHandler } from 'express';

import { sendSuccess } from '../../services/apiResponse.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import { getActiveMap, getAuthorizedActiveMap } from './map.service.js';
import type { ActiveMapLookup } from './map.service.js';
import type { ActiveMapRouteParams } from './map.validation.js';
import { sendModuleHealth } from '../../services/health-response.js';
import { getMapHealth } from './map.service.js';
import type { AuthLocals } from '../auth/auth.types.js';

export function createGetActiveMapController(
  lookup: ActiveMapLookup = getActiveMap,
): RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> {
  return async (_request, response) => {
    const validated = getValidatedRequest<{ params: ActiveMapRouteParams }>(response);
    const campusMap = await getAuthorizedActiveMap(response.locals.auth, validated.params.campusId, lookup);

    sendSuccess(response, campusMap);
  };
}

export const getActiveMapController = createGetActiveMapController();

export const getMapHealthController: RequestHandler = async (_request, response) => {
  sendModuleHealth(response, await getMapHealth());
};
