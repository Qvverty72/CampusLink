import { Router } from 'express';

import { ApiError } from '../services/apiError.js';
import { createMapRouter } from '../modules/maps/map.routes.js';
import type { ActiveMapLookup } from '../modules/maps/map.service.js';

export function createApiRouter(lookup?: ActiveMapLookup): Router {
  const apiRouter = Router();

  // Keep the existing health contract stable while other routes use envelopes.
  apiRouter.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  apiRouter.use('/maps', createMapRouter(lookup));
  apiRouter.use((_request, _response, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'API endpoint not found.'));
  });

  return apiRouter;
}

export const apiRouter = createApiRouter();
