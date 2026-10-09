import { Router } from 'express';
import { loginAccountController, recoverAccountController, resetAccountPasswordController, completeInstitutionalRegistrationController, confirmInstitutionalRegistrationController, getAuthHealthController, getAuthIdentityController, getRegistrationOptionsController, registerInstitutionalAccountController, resendInstitutionalConfirmationController } from './auth.controller.js';
import { requireAuthentication, requireVerifiedIdentity } from './auth.middleware.js';

// Health is an opt-in public diagnostic. /me requires identity, and only returns that user's context.
export function createAuthRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAuthHealthController);
  // Public credential exchanges. Auth validates passwords and the expiring recovery OTP.
  router.post('/login', loginAccountController);
  router.post('/recover', recoverAccountController);
  router.post('/recover/confirm', resetAccountPasswordController);
  router.get('/registration-options', getRegistrationOptionsController);
  router.post('/register', registerInstitutionalAccountController);
  router.post('/register/confirm', confirmInstitutionalRegistrationController);
  router.post('/register/resend', resendInstitutionalConfirmationController);
  router.post('/register/complete', requireVerifiedIdentity, completeInstitutionalRegistrationController);
  router.get('/me', requireAuthentication, getAuthIdentityController);
  return router;
}
