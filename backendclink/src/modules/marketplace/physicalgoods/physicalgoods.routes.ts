import { json, Router } from 'express';
import { createPhysicalgoodsController, getPhysicalgoodsHealthController, getPhysicalgoodsOptionsController, getPhysicalgoodsPhotoController } from './physicalgoods.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { addPhysicalgoodsImageController, changePhysicalgoodsCategoryController, changePhysicalgoodsPrincipalController, deletePhysicalgoodsImageController, getPhysicalgoodsGalleryController, getPhysicalgoodsResourcesController } from './physicalgoods.controller.js';
import { updatePhysicalgoodsController, withdrawPhysicalgoodsController } from './physicalgoods.controller.js';
import { createPhysicalgoodsRequestController, getPhysicalgoodsRequestOptionsController } from './physicalgoods.controller.js';
import { getReceivedPhysicalgoodsRequestsController, getSentPhysicalgoodsRequestsController, resolvePhysicalgoodsRequestController, confirmPhysicalgoodsTransactionController, cancelPhysicalgoodsTransactionController } from './physicalgoods.controller.js';
import { getPhysicalgoodsTransactionController,getPhysicalgoodsCoordinationOptionsController,getPhysicalgoodsCoordinationMessagesController,sendPhysicalgoodsCoordinationController,ratePhysicalgoodsOwnerController } from './physicalgoods.controller.js';
import { getOwnPhysicalgoodsController,getOwnPhysicalgoodsDetailController,getOwnPhysicalgoodsRequestController,getOwnPhysicalgoodsTransactionsController } from './physicalgoods.controller.js';
import {getPhysicalgoodsRequestCountsController} from './physicalgoods.controller.js';

// Solo expone diagnósticos técnicos; las rutas de negocio requieren autenticación.
export function createPhysicalgoodsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getPhysicalgoodsHealthController);
  router.get('/options', requireAuthentication, getPhysicalgoodsOptionsController);
  router.get('/my-publications',requireAuthentication,getOwnPhysicalgoodsController);
  router.get('/transactions',requireAuthentication,getOwnPhysicalgoodsTransactionsController);
  router.get('/received-requests', requireAuthentication, getReceivedPhysicalgoodsRequestsController);
  router.get('/sent-requests', requireAuthentication, getSentPhysicalgoodsRequestsController);
  router.get('/request-counts',requireAuthentication,getPhysicalgoodsRequestCountsController);
  router.get('/', requireAuthentication, getPhysicalgoodsResourcesController);
  // Base64 de una foto con tamaño limitado mantiene un mismo contrato JSON para web y nativo.
  router.post('/', requireAuthentication, json({ limit: '7mb' }), createPhysicalgoodsController);
  router.get('/:publicationId/photo', requireAuthentication, getPhysicalgoodsPhotoController);
  router.get('/:publicationId/images', requireAuthentication, getPhysicalgoodsGalleryController);
  router.get('/:publicationId/history',requireAuthentication,getOwnPhysicalgoodsDetailController);
  router.get('/:publicationId/requests/:requestId',requireAuthentication,getOwnPhysicalgoodsRequestController);
  router.get('/:publicationId/request-options', requireAuthentication, getPhysicalgoodsRequestOptionsController);
  router.post('/:publicationId/requests', requireAuthentication, createPhysicalgoodsRequestController);
  router.patch('/:publicationId/requests/:requestId', requireAuthentication, resolvePhysicalgoodsRequestController);
  router.post('/:publicationId/transactions/:transactionId/confirm', requireAuthentication, confirmPhysicalgoodsTransactionController);
  router.post('/:publicationId/transactions/:transactionId/cancel', requireAuthentication, cancelPhysicalgoodsTransactionController);
  router.post('/:publicationId/transactions/:transactionId/rating',requireAuthentication,ratePhysicalgoodsOwnerController);
  router.get('/:publicationId/transactions/:transactionId',requireAuthentication,getPhysicalgoodsTransactionController);
  router.get('/:publicationId/transactions/:transactionId/coordination-options',requireAuthentication,getPhysicalgoodsCoordinationOptionsController);
  router.get('/:publicationId/transactions/:transactionId/messages',requireAuthentication,getPhysicalgoodsCoordinationMessagesController);
  router.post('/:publicationId/transactions/:transactionId/messages',requireAuthentication,sendPhysicalgoodsCoordinationController);
  router.patch('/:publicationId', requireAuthentication, updatePhysicalgoodsController);
  router.delete('/:publicationId', requireAuthentication, withdrawPhysicalgoodsController);
  router.post('/:publicationId/images', requireAuthentication, json({ limit: '7mb' }), addPhysicalgoodsImageController);
  router.patch('/:publicationId/images/:imageId/principal', requireAuthentication, changePhysicalgoodsPrincipalController);
  router.delete('/:publicationId/images/:imageId', requireAuthentication, deletePhysicalgoodsImageController);
  router.patch('/:publicationId/category', requireAuthentication, changePhysicalgoodsCategoryController);
  return router;
}
