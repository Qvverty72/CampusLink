import type { RequestHandler } from 'express';

import { ApiError } from '../../services/apiError.js';
import { sendSuccess } from '../../services/apiResponse.js';
import { getValidatedRequest } from '../../middleware/validateRequest.js';
import { getActiveMap } from './map.service.js';
import type { ActiveMapLookup } from './map.service.js';
import type { ActiveMapRouteParams } from './map.validation.js';

export function createGetActiveMapController(
  lookup: ActiveMapLookup = getActiveMap,
): RequestHandler {
  return async (_request, response) => {
    const validated = getValidatedRequest<{ params: ActiveMapRouteParams }>(response);
    const campusMap = await lookup(validated.params.campusId);

    if (!campusMap) {
      throw new ApiError(404, 'NOT_FOUND', 'Active campus map not found.');
    }

    sendSuccess(response, campusMap);
  };
}

export const getActiveMapController = createGetActiveMapController();
