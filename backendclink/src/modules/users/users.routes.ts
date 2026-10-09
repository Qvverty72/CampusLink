import { Router } from 'express';
import { getUsersHealthController } from './users.controller.js';
import { getAcademicProfileController, getAcademicOptionsController, updateAcademicProfileController } from './users.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createUsersRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getUsersHealthController);
  router.get('/me/profile', requireAuthentication, getAcademicProfileController);
  router.get('/me/profile-options', requireAuthentication, getAcademicOptionsController);
  router.patch('/me/profile', requireAuthentication, updateAcademicProfileController);
  return router;
}
