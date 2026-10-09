import { Router } from 'express';
import { getPhysicalgoodsHealthController } from './physicalgoods.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createPhysicalgoodsRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getPhysicalgoodsHealthController);
  return router;
}
