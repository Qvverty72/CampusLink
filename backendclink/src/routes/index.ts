import { Router } from 'express';
import { env } from '../config/env.js';
import { createAnalyticsRouter } from '../modules/analytics/analytics.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createMapRouter } from '../modules/maps/map.routes.js';
import { createElibraryRouter } from '../modules/marketplace/elibrary/elibrary.routes.js';
import { createPhysicalgoodsRouter } from '../modules/marketplace/physicalgoods/physicalgoods.routes.js';
import { createReportsRouter } from '../modules/reports/reports.routes.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { getReadiness } from '../services/readiness.js';
import { sendError, sendSuccess } from '../services/api-response.js';
import { ApiError } from '../services/apiError.js';
import type { ActiveMapLookup } from '../modules/maps/map.service.js';

export interface ApiRouterOptions {
  getActiveMap?: ActiveMapLookup;
  diagnosticsEnabled?: boolean;
}

export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const apiRouter = Router();
  const diagnosticsEnabled = options.diagnosticsEnabled ?? env.healthDiagnosticsEnabled;
  // Even an explicit override cannot enable detailed diagnostics outside development.
  const diagnostics = env.nodeEnv === 'development' && diagnosticsEnabled;

  // Keep the existing health contract stable while other routes use envelopes.
  apiRouter.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  if (diagnostics) apiRouter.get('/ready', async (_request, response) => {
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
