import { Router } from 'express';

import { mapRouter } from '../modules/maps/map.routes.js';

// Router raíz de la API versionada. `app.ts` lo monta bajo `/api/v1`, mientras
// cada módulo conserva únicamente el segmento de URL que le pertenece.
export const apiRouter = Router();

apiRouter.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

// El endpoint definido como `/:campusId/active` en el módulo queda expuesto como
// `GET /api/v1/maps/:campusId/active` al combinar ambos prefijos.
apiRouter.use('/maps', mapRouter);

