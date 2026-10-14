import { Router } from 'express';
import { loginAccountController, recoverAccountController, resetAccountPasswordController, completeInstitutionalRegistrationController, confirmInstitutionalRegistrationController, getAuthHealthController, getAuthIdentityController, getRegistrationOptionsController, registerInstitutionalAccountController, resendInstitutionalConfirmationController } from './auth.controller.js';
import { requireAuthentication, requireVerifiedIdentity } from './auth.middleware.js';

// Salud es un diagnóstico público optativo. `/me` requiere identidad y devuelve solo su contexto.
export function createAuthRouter(diagnosticsEnabled: boolean): Router {
  const router = Router();
  if (diagnosticsEnabled) router.get('/health', getAuthHealthController);
  // Intercambios públicos de credenciales; Auth valida contraseñas y el OTP de recuperación temporal.
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
