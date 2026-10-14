import { json, Router } from 'express';
import { createPhysicalgoodsController, getPhysicalgoodsHealthController, getPhysicalgoodsOptionsController, getPhysicalgoodsPhotoController } from './physicalgoods.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { addPhysicalgoodsImageController, changePhysicalgoodsCategoryController, changePhysicalgoodsPrincipalController, deletePhysicalgoodsImageController, getPhysicalgoodsGalleryController, getPhysicalgoodsResourcesController } from './physicalgoods.controller.js';
import { updatePhysicalgoodsController, withdrawPhysicalgoodsController } from './physicalgoods.controller.js';

// Solo expone diagnósticos técnicos; las rutas de negocio requieren autenticación.
export function createPhysicalgoodsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getPhysicalgoodsHealthController);
  router.get('/options', requireAuthentication, getPhysicalgoodsOptionsController);
  router.get('/', requireAuthentication, getPhysicalgoodsResourcesController);
  // Base64 de una foto con tamaño limitado mantiene un mismo contrato JSON para web y nativo.
  router.post('/', requireAuthentication, json({ limit: '7mb' }), createPhysicalgoodsController);
  router.get('/:publicationId/photo', requireAuthentication, getPhysicalgoodsPhotoController);
  router.get('/:publicationId/images', requireAuthentication, getPhysicalgoodsGalleryController);
  router.patch('/:publicationId', requireAuthentication, updatePhysicalgoodsController);
  router.delete('/:publicationId', requireAuthentication, withdrawPhysicalgoodsController);
  router.post('/:publicationId/images', requireAuthentication, json({ limit: '7mb' }), addPhysicalgoodsImageController);
  router.patch('/:publicationId/images/:imageId/principal', requireAuthentication, changePhysicalgoodsPrincipalController);
  router.delete('/:publicationId/images/:imageId', requireAuthentication, deletePhysicalgoodsImageController);
  router.patch('/:publicationId/category', requireAuthentication, changePhysicalgoodsCategoryController);
  return router;
}
