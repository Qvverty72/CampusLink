import { Router } from 'express';
import { getActiveMapController, getMapHealthController } from './map.controller.js';

export function createMapRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getMapHealthController);
  // Legacy read contract retained for Expo. Full access control belongs to F2.2-07/F2.2-10/F2.3-06.
  router.get('/:campusId/active', getActiveMapController);
  return router;
}
