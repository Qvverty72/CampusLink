import { Router } from 'express';
import { getElibraryHealthController } from './elibrary.controller.js';

// Solo expone diagnósticos técnicos; las rutas de negocio deberán definir autenticación y autorización.
export function createElibraryRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getElibraryHealthController);
  return router;
}
