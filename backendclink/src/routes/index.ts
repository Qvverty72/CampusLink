import { Router } from 'express';

import { mapRouter } from '../modules/maps/map.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

apiRouter.use('/maps', mapRouter);

