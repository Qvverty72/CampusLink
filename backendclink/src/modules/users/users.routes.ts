import { createPolicyRouter, publicEndpoint } from '../../shared/http/endpoint-policy.js';
import type { Router } from 'express';
import { getProfileOverviewController, getUsersHealthController } from './controllers/users.controller.js';
import { getAcademicProfileController, getAcademicOptionsController, updateAcademicProfileController } from './controllers/users.controller.js';
import { requireAuthentication } from '../auth/middleware/auth.middleware.js';
import { getAccessCampusesController, getAccessCatalogController, listAccessUsersController, getUserAccessController, updateUserAccessController, updateAccountStateController } from './controllers/access.controller.js';
import { listAuditEntriesController, getAuditEntryController, getAuditImageController, getAuditParticipationController, getAuditOccurrencesController, getAuditEditsController } from './controllers/access.controller.js';
import { createNotificationsRouter } from './notifications.routes.js';

// Los diagnósticos son técnicos; las rutas de negocio verifican identidad y contexto.
export function createUsersRouter(diagnosticsEnabled: boolean): Router {
  const router = createPolicyRouter();
  router.get('/me/overview', requireAuthentication, getProfileOverviewController);
  router.use('/me/notifications', createNotificationsRouter());
  if (diagnosticsEnabled) router.get('/health', publicEndpoint, getUsersHealthController);
  router.get('/me/profile', requireAuthentication, getAcademicProfileController);
  router.get('/me/profile-options', requireAuthentication, getAcademicOptionsController);
  router.patch('/me/profile', requireAuthentication, updateAcademicProfileController);
  // El servicio vuelve a comprobar la asignación administrativa vigente en cada campus solicitado.
  router.get('/access/campuses', requireAuthentication, getAccessCampusesController);
  router.get('/access/campuses/:campusId/audit', requireAuthentication, listAuditEntriesController);
  router.get('/access/campuses/:campusId/audit/:auditId', requireAuthentication, getAuditEntryController);
  router.get('/access/campuses/:campusId/audit/:auditId/images/:imageId', requireAuthentication, getAuditImageController);
  router.get('/access/campuses/:campusId/audit/:auditId/participation', requireAuthentication, getAuditParticipationController);
  router.get('/access/campuses/:campusId/audit/:auditId/occurrences', requireAuthentication, getAuditOccurrencesController);
  router.get('/access/campuses/:campusId/audit/:auditId/edits', requireAuthentication, getAuditEditsController);
  router.get('/access/campuses/:campusId/catalog', requireAuthentication, getAccessCatalogController);
  router.get('/access/campuses/:campusId/users', requireAuthentication, listAccessUsersController);
  router.get('/access/campuses/:campusId/users/:userId', requireAuthentication, getUserAccessController);
  router.patch('/access/campuses/:campusId/users/:userId', requireAuthentication, updateUserAccessController);
  router.patch('/access/campuses/:campusId/users/:userId/state', requireAuthentication, updateAccountStateController);
  return router;
}
