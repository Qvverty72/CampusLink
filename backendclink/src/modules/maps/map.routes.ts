import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createGetActiveMapController, getMapHealthController } from './map.controller.js';
import type { ActiveMapLookup } from './map.service.js';
import { parseActiveMapParams } from './map.validation.js';

export interface MapRouterOptions {
  lookup?: ActiveMapLookup;
  diagnosticsEnabled?: boolean;
}

export function createMapRouter(options: MapRouterOptions = {}): Router {
  const mapRouter = Router();

  if (options.diagnosticsEnabled) {
    mapRouter.get('/health', getMapHealthController);
  }

  mapRouter.get(
    '/:campusId/active',
    validateRequest({ params: parseActiveMapParams }),
    createGetActiveMapController(options.lookup),
  );

  return mapRouter;
}

export const mapRouter = createMapRouter();
