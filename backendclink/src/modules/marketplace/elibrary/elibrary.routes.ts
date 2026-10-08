import { Router } from 'express';
import { getElibraryHealthController } from './elibrary.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createElibraryRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getElibraryHealthController);
  return router;
}
