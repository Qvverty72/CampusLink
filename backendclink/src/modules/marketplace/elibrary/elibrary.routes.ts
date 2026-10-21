import { Router } from 'express';
import { getElibraryHealthController } from './elibrary.controller.js';
import { createDigitalController, detailDigitalController, listDigitalController } from './elibrary.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { addDigitalFileController, downloadDigitalFileController } from './elibrary.controller.js';
import { digitalAcademicCatalogController, updateDigitalAcademicsController } from './elibrary.controller.js';
import { digitalPreviewController } from './elibrary.controller.js';
import { acquiredDigitalController,acquiredDigitalDetailController } from './elibrary.controller.js';
import { ownedDigitalController,ownedDigitalDetailController,editDigitalController } from './elibrary.controller.js';
import { recommendationsDigitalController } from './elibrary.controller.js';
import { createDigitalRequestController, digitalRequestOptionsController, receivedDigitalRequestsController, sentDigitalRequestsController,
  resolveDigitalRequestController, detailDigitalTradeController, transitionDigitalTradeController } from './elibrary.controller.js';

// El cuerpo binario se analiza en controller después de verificar la identidad.
export function createElibraryRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getElibraryHealthController);
  router.post('/', requireAuthentication, createDigitalController);
  router.get('/', requireAuthentication, listDigitalController);
  router.get('/academic-options', requireAuthentication, digitalAcademicCatalogController);
  router.get('/recommendations',requireAuthentication,recommendationsDigitalController);
  router.get('/acquired', requireAuthentication, acquiredDigitalController);
  router.get('/acquired/:publicationId', requireAuthentication, acquiredDigitalDetailController);
  router.get('/mine', requireAuthentication, ownedDigitalController);
  router.get('/mine/:publicationId', requireAuthentication, ownedDigitalDetailController);
  router.get('/requests/received', requireAuthentication, receivedDigitalRequestsController);
  router.get('/requests/sent', requireAuthentication, sentDigitalRequestsController);
  router.get('/:publicationId', requireAuthentication, detailDigitalController);
  router.patch('/:publicationId',requireAuthentication,editDigitalController(false));
  router.delete('/:publicationId',requireAuthentication,editDigitalController(true));
  router.patch('/:publicationId/academics', requireAuthentication, updateDigitalAcademicsController);
  router.post('/:publicationId/files', requireAuthentication, addDigitalFileController);
  router.get('/:publicationId/files/:fileId/download', requireAuthentication, downloadDigitalFileController);
  router.get('/:publicationId/files/:fileId/preview', requireAuthentication, digitalPreviewController);
  router.get('/:publicationId/request-options', requireAuthentication, digitalRequestOptionsController);
  router.post('/:publicationId/requests', requireAuthentication, createDigitalRequestController);
  router.patch('/:publicationId/requests/:requestId', requireAuthentication, resolveDigitalRequestController);
  router.get('/:publicationId/transactions/:transactionId', requireAuthentication, detailDigitalTradeController);
  router.post('/:publicationId/transactions/:transactionId/confirm', requireAuthentication, transitionDigitalTradeController('CONFIRMAR'));
  router.post('/:publicationId/transactions/:transactionId/cancel', requireAuthentication, transitionDigitalTradeController('CANCELAR'));
  return router;
}
