import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Express } from 'express';

import { apiErrorHandler } from './middleware/apiErrorHandler.js';
import { notFoundHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';
import type { ActiveMapLookup } from './modules/maps/map.service.js';
import type { ActivityDependencies } from './modules/activities/activities.service.js';
import { createRateLimits } from './middleware/rate-limit.js';
import type { RateLimitStore } from './services/rate-limit.js';

export interface AppDependencies {
  getActiveMap?: ActiveMapLookup;
  activities?: ActivityDependencies;
  diagnosticsEnabled?: boolean;
  rateLimitStore?: RateLimitStore;
}

/**
 * Ensambla middleware y rutas HTTP sin iniciar conexiones ni abrir el puerto.
 * La separación permite montar la aplicación con dependencias simuladas en pruebas.
 */
export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ preflightContinue: true, exposedHeaders: ['Retry-After'] }));
  const limits = createRateLimits(dependencies.rateLimitStore);
  app.locals.rateLimitIdentity = limits.identity;
  app.use('/api/v1', limits.origin);
  app.options(/.*/, (_request, response) => { response.sendStatus(204); });
  const jsonParser = express.json();
  app.use((request, response, next) => {
    // Las publicaciones analizan sus cargas acotadas después de autenticar.
    if (request.method === 'POST' && (/^\/api\/v1\/marketplace\/physicalgoods(?:\/[^/]+\/images)?\/?$/i.test(request.path)
      || /^\/api\/v1\/marketplace\/elibrary(?:\/[^/]+\/files)?\/?$/i.test(request.path))) next();
    else jsonParser(request, response, next);
  });
  app.use('/api/v1', createApiRouter(dependencies));
  app.use(notFoundHandler);
  app.use(apiErrorHandler);

  return app;
}

export const app = createApp();
