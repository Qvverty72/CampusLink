import { createPolicyRouter, publicEndpoint } from '../../../shared/http/endpoint-policy.js';
import type { Router } from 'express';
import { getElibraryHealthController } from './controllers/elibrary.controller.js';
import { createDigitalController, detailDigitalController, listDigitalController } from './controllers/elibrary.controller.js';
import { requireAuthentication } from '../../auth/middleware/auth.middleware.js';
import { addDigitalFileController, downloadDigitalFileController } from './controllers/elibrary.controller.js';
import { digitalAcademicCatalogController, updateDigitalAcademicsController } from './controllers/elibrary.controller.js';
import { digitalPreviewController } from './controllers/elibrary.controller.js';
import { acquiredDigitalController,acquiredDigitalDetailController } from './controllers/elibrary.controller.js';
import { ownedDigitalController,ownedDigitalDetailController,editDigitalController } from './controllers/elibrary.controller.js';
import { recommendationsDigitalController } from './controllers/elibrary.controller.js';
import { rateDigitalController } from './controllers/elibrary.controller.js';
import {digitalActivityController} from './controllers/elibrary.controller.js';
import { digitalMessagesController, sendDigitalMessageController } from './controllers/elibrary.controller.js';
import { createDigitalRequestController, digitalRequestOptionsController, receivedDigitalRequestsController, sentDigitalRequestsController,
  resolveDigitalRequestController, detailDigitalTradeController, transitionDigitalTradeController } from './controllers/elibrary.controller.js';

// El cuerpo binario se analiza en controller después de verificar la identidad.
export function createElibraryRouter(diagnosticsEnabled: boolean): Router {
  const router = createPolicyRouter();
  if (diagnosticsEnabled) router.get('/health', publicEndpoint, getElibraryHealthController);
  router.post('/', requireAuthentication, createDigitalController);
  router.get('/activity/counts',requireAuthentication,digitalActivityController('counts'));
  router.get('/activity/requests',requireAuthentication,digitalActivityController('requests'));
  router.get('/activity/resources',requireAuthentication,digitalActivityController('resources'));
  router.get('/activity/transactions',requireAuthentication,digitalActivityController('transactions'));
  router.get('/activity/publications',requireAuthentication,digitalActivityController('publications'));
  router.get('/activity/resource/:publicationId',requireAuthentication,digitalActivityController('resource'));
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
  router.get('/:publicationId/transactions/:transactionId/messages', requireAuthentication, digitalMessagesController);
  router.post('/:publicationId/transactions/:transactionId/messages', requireAuthentication, sendDigitalMessageController);
  router.post('/:publicationId/transactions/:transactionId/confirm', requireAuthentication, transitionDigitalTradeController('CONFIRMAR'));
  router.post('/:publicationId/transactions/:transactionId/cancel', requireAuthentication, transitionDigitalTradeController('CANCELAR'));
  router.post('/:publicationId/transactions/:transactionId/rating',requireAuthentication,rateDigitalController);
  return router;
}
