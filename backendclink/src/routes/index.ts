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

export function createApiRouter(diagnosticsEnabled = env.healthDiagnosticsEnabled): Router {
  const router = Router();
  // Even an explicit override cannot enable detailed diagnostics in production/test.
  const diagnostics = env.nodeEnv === 'development' && diagnosticsEnabled;
  router.get('/health', (_request, response) => { response.json({ status: 'ok' }); });
  if (diagnostics) router.get('/ready', async (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const readiness = await getReadiness();
    if (readiness.status === 'unavailable') {
      sendError(response, 503, 'DEPENDENCY_UNAVAILABLE', 'A required dependency is unavailable');
      return;
    }
    sendSuccess(response, readiness);
  });
  router.use('/users', createUsersRouter(diagnostics));
  router.use('/auth', createAuthRouter(diagnostics));
  router.use('/maps', createMapRouter(diagnostics));
  router.use('/marketplace/physicalgoods', createPhysicalgoodsRouter(diagnostics));
  router.use('/marketplace/elibrary', createElibraryRouter(diagnostics));
  router.use('/reports', createReportsRouter(diagnostics));
  router.use('/analytics', createAnalyticsRouter(diagnostics));
  return router;
}
