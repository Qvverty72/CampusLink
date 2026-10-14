import { json, Router } from 'express';
import { createPhysicalgoodsController, getPhysicalgoodsHealthController, getPhysicalgoodsOptionsController, getPhysicalgoodsPhotoController } from './physicalgoods.controller.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createPhysicalgoodsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getPhysicalgoodsHealthController);
  router.get('/options', requireAuthentication, getPhysicalgoodsOptionsController);
  // Base64 for one bounded photo keeps web/native on the same JSON contract.
  router.post('/', requireAuthentication, json({ limit: '7mb' }), createPhysicalgoodsController);
  router.get('/:publicationId/photo', requireAuthentication, getPhysicalgoodsPhotoController);
  return router;
}
