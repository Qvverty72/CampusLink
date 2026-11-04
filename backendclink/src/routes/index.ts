import { createPolicyRouter, publicEndpoint } from '../shared/http/endpoint-policy.js';
import type { Router } from 'express';
import { createActivitiesRouter } from '../modules/activities/activities.routes.js';
import type { ActivityDependencies } from '../modules/activities/services/activities.service.js';
import { env } from '../config/env.js';
import { createAnalyticsRouter } from '../modules/analytics/analytics.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createMapRouter } from '../modules/maps/map.routes.js';
import { createElibraryRouter } from '../modules/marketplace/elibrary/elibrary.routes.js';
import { createPhysicalgoodsRouter } from '../modules/marketplace/physicalgoods/physicalgoods.routes.js';
import { createReportsRouter } from '../modules/reports/reports.routes.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { getReadiness } from '../readiness.js';
import { sendError, sendSuccess } from '../shared/http/api-response.js';
import { ApiError } from '../shared/errors/api-error.js';
import type { ActiveMapLookup } from '../modules/maps/services/map.service.js';

export interface ApiRouterOptions {
  getActiveMap?: ActiveMapLookup;
  activities?: ActivityDependencies;
  diagnosticsEnabled?: boolean;
}

/**
 * Registra los módulos bajo `/api/v1` y permite inyectar consultas para pruebas.
 * Los diagnósticos detallados solo se habilitan en desarrollo, aun con una opción explícita.
 */
export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const apiRouter = createPolicyRouter();
  const diagnosticsEnabled = options.diagnosticsEnabled ?? env.healthDiagnosticsEnabled;
  // Una opción explícita tampoco habilita diagnósticos detallados fuera de desarrollo.
  const diagnostics = env.nodeEnv === 'development' && diagnosticsEnabled;

  // Conserva el contrato histórico de salud; las demás rutas usan sobres de respuesta.
  apiRouter.get('/health', publicEndpoint, (_request, response) => {
    response.json({ status: 'ok' });
  });

  if (diagnostics) apiRouter.get('/ready', publicEndpoint, async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const readiness = await getReadiness();
    if (readiness.status === 'unavailable') {
      sendError(response, 503, 'DEPENDENCY_UNAVAILABLE', 'A required dependency is unavailable');
      return;
    }
    sendSuccess(response, readiness);
  });

  apiRouter.use('/users', createUsersRouter(diagnostics));
  apiRouter.use('/auth', createAuthRouter(diagnostics));
  apiRouter.use('/activities', createActivitiesRouter({ getActiveMap: options.getActiveMap, ...options.activities }));
  apiRouter.use('/maps', createMapRouter({
    lookup: options.getActiveMap,
    diagnosticsEnabled: diagnostics,
  }));
  apiRouter.use('/marketplace/physicalgoods', createPhysicalgoodsRouter(diagnostics));
  apiRouter.use('/marketplace/elibrary', createElibraryRouter(diagnostics));
  apiRouter.use('/reports', createReportsRouter(diagnostics));
  apiRouter.use('/analytics', createAnalyticsRouter(diagnostics));
  apiRouter.use((_request, _response, next) => {
    next(new ApiError(404, 'NOT_FOUND', 'API endpoint not found.'));
  });

  return apiRouter;
}

export const apiRouter = createApiRouter();
