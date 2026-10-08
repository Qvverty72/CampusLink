import { Router } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { createGetActiveMapController } from './map.controller.js';
import type { ActiveMapLookup } from './map.service.js';
import { parseActiveMapParams } from './map.validation.js';

export function createMapRouter(lookup?: ActiveMapLookup): Router {
  const mapRouter = Router();

  mapRouter.get(
    '/:campusId/active',
    validateRequest({ params: parseActiveMapParams }),
    createGetActiveMapController(lookup),
  );

  return mapRouter;
}

export const mapRouter = createMapRouter();
