import { Router } from 'express';
import { getAuthHealthController } from './auth.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createAuthRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAuthHealthController);
  return router;
}
