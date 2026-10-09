import { Router } from 'express';
import { getUsersHealthController } from './users.controller.js';
import { getAcademicProfileController, getAcademicOptionsController, updateAcademicProfileController } from './users.controller.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { getAccessCampusesController, getAccessCatalogController, listAccessUsersController, getUserAccessController, updateUserAccessController, updateAccountStateController } from './access.controller.js';

// Technical diagnostics only; business routes must declare authentication/authorization.
export function createUsersRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getUsersHealthController);
  router.get('/me/profile', requireAuthentication, getAcademicProfileController);
  router.get('/me/profile-options', requireAuthentication, getAcademicOptionsController);
  router.patch('/me/profile', requireAuthentication, updateAcademicProfileController);
  // Service rechecks the current administrator assignment for each requested campus.
  router.get('/access/campuses', requireAuthentication, getAccessCampusesController);
  router.get('/access/campuses/:campusId/catalog', requireAuthentication, getAccessCatalogController);
  router.get('/access/campuses/:campusId/users', requireAuthentication, listAccessUsersController);
  router.get('/access/campuses/:campusId/users/:userId', requireAuthentication, getUserAccessController);
  router.patch('/access/campuses/:campusId/users/:userId', requireAuthentication, updateUserAccessController);
  router.patch('/access/campuses/:campusId/users/:userId/state', requireAuthentication, updateAccountStateController);
  return router;
}
