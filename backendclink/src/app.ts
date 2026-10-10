import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Express } from 'express';

import { apiErrorHandler } from './middleware/apiErrorHandler.js';
import { notFoundHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes/index.js';
import type { ActiveMapLookup } from './modules/maps/map.service.js';
import type { ActivityDependencies } from './modules/activities/activities.service.js';

export interface AppDependencies {
  getActiveMap?: ActiveMapLookup;
  activities?: ActivityDependencies;
  diagnosticsEnabled?: boolean;
}

/** Builds the HTTP application separately from the process and database bootstrap. */
export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use('/api/v1', createApiRouter(dependencies));
  app.use(notFoundHandler);
  app.use(apiErrorHandler);

  return app;
}

export const app = createApp();
