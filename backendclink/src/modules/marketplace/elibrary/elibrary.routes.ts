import { Router } from 'express';
import { getElibraryHealthController } from './elibrary.controller.js';
import { createDigitalController, detailDigitalController, listDigitalController } from './elibrary.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { addDigitalFileController, downloadDigitalFileController } from './elibrary.controller.js';
import { digitalAcademicCatalogController, updateDigitalAcademicsController } from './elibrary.controller.js';

// El cuerpo binario se analiza en controller después de verificar la identidad.
export function createElibraryRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getElibraryHealthController);
  router.post('/', requireAuthentication, createDigitalController);
  router.get('/', requireAuthentication, listDigitalController);
  router.get('/academic-options', requireAuthentication, digitalAcademicCatalogController);
  router.get('/:publicationId', requireAuthentication, detailDigitalController);
  router.patch('/:publicationId/academics', requireAuthentication, updateDigitalAcademicsController);
  router.post('/:publicationId/files', requireAuthentication, addDigitalFileController);
  router.get('/:publicationId/files/:fileId/download', requireAuthentication, downloadDigitalFileController);
  return router;
}
