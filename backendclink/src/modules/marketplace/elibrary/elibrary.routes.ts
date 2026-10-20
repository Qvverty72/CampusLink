import { Router } from 'express';
import { getElibraryHealthController } from './elibrary.controller.js';
import { createDigitalController, detailDigitalController, listDigitalController } from './elibrary.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';

// El cuerpo binario se analiza en controller después de verificar la identidad.
export function createElibraryRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getElibraryHealthController);
  router.post('/', requireAuthentication, createDigitalController);
  router.get('/', requireAuthentication, listDigitalController);
  router.get('/:publicationId', requireAuthentication, detailDigitalController);
  return router;
}
