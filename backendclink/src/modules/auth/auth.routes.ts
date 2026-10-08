import { Router } from 'express';
import { getAuthHealthController, getAuthIdentityController } from './auth.controller.js';
import { requireAuthentication } from './auth.middleware.js';

// Health is an opt-in public diagnostic. /me requires identity, and only returns that user's context.
export function createAuthRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAuthHealthController);
  router.get('/me', requireAuthentication, getAuthIdentityController);
  return router;
}
