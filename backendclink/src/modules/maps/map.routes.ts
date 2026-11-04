import { createPolicyRouter, publicEndpoint } from '../../shared/http/endpoint-policy.js';
import type { Router } from 'express';
import { validateRequest } from '../../shared/http/validate-request.js';
import { createGetActiveMapController, getMapHealthController } from './controllers/map.controller.js';
import type { ActiveMapLookup } from './services/map.service.js';
import { parseActiveMapParams } from './validators/map.validation.js';
import { requireAuthentication } from '../auth/middleware/auth.middleware.js';

export interface MapRouterOptions {
  lookup?: ActiveMapLookup;
  diagnosticsEnabled?: boolean;
}

/** Registra lectura del mapa activo y, si se habilitan, diagnósticos técnicos del módulo. */
export function createMapRouter(options: MapRouterOptions = {}): Router {
  const mapRouter = createPolicyRouter();

  if (options.diagnosticsEnabled) {
    mapRouter.get('/health', publicEndpoint, getMapHealthController);
  }

  mapRouter.get(
    '/:campusId/active',
    requireAuthentication,
    validateRequest({ params: parseActiveMapParams }),
    createGetActiveMapController(options.lookup),
  );

  return mapRouter;
}

export const mapRouter = createMapRouter();
