import { Router } from 'express';
import { getUsersHealthController } from './users.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createUsersRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getUsersHealthController);
  return router;
}
