import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

// Compose HTTP without connecting databases or opening a port; useful for integration tests.
export function createApp(diagnosticsEnabled?: boolean) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use('/api/v1', createApiRouter(diagnosticsEnabled));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
export const app = createApp();
