import { json, Router } from 'express';
import { createPhysicalgoodsController, getPhysicalgoodsHealthController, getPhysicalgoodsOptionsController, getPhysicalgoodsPhotoController } from './physicalgoods.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { addPhysicalgoodsImageController, changePhysicalgoodsCategoryController, changePhysicalgoodsPrincipalController, deletePhysicalgoodsImageController, getPhysicalgoodsGalleryController, getPhysicalgoodsResourcesController } from './physicalgoods.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createPhysicalgoodsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getPhysicalgoodsHealthController);
  router.get('/options', requireAuthentication, getPhysicalgoodsOptionsController);
  router.get('/', requireAuthentication, getPhysicalgoodsResourcesController);
  // Base64 for one bounded photo keeps web/native on the same JSON contract.
  router.post('/', requireAuthentication, json({ limit: '7mb' }), createPhysicalgoodsController);
  router.get('/:publicationId/photo', requireAuthentication, getPhysicalgoodsPhotoController);
  router.get('/:publicationId/images', requireAuthentication, getPhysicalgoodsGalleryController);
  router.post('/:publicationId/images', requireAuthentication, json({ limit: '7mb' }), addPhysicalgoodsImageController);
  router.patch('/:publicationId/images/:imageId/principal', requireAuthentication, changePhysicalgoodsPrincipalController);
  router.delete('/:publicationId/images/:imageId', requireAuthentication, deletePhysicalgoodsImageController);
  router.patch('/:publicationId/category', requireAuthentication, changePhysicalgoodsCategoryController);
  return router;
}
