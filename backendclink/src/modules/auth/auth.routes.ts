import { createPolicyRouter, publicEndpoint } from '../../shared/http/endpoint-policy.js';
import type { Router } from 'express';
import { loginAccountController, recoverAccountController, resetAccountPasswordController, completeInstitutionalRegistrationController, confirmInstitutionalRegistrationController, getAuthHealthController, getAuthIdentityController, getRegistrationOptionsController, registerInstitutionalAccountController, resendInstitutionalConfirmationController } from './controllers/auth.controller.js';
import { requireAuthentication, requireVerifiedIdentity } from './middleware/auth.middleware.js';

// Salud es un diagnóstico público optativo. `/me` requiere identidad y devuelve solo su contexto.
export function createAuthRouter(diagnosticsEnabled: boolean): Router {
  const router = createPolicyRouter();
  if (diagnosticsEnabled) router.get('/health', publicEndpoint, getAuthHealthController);
  // Intercambios públicos de credenciales; Auth valida contraseñas y el OTP de recuperación temporal.
  router.post('/login', publicEndpoint, loginAccountController);
  router.post('/recover', publicEndpoint, recoverAccountController);
  router.post('/recover/confirm', publicEndpoint, resetAccountPasswordController);
  router.get('/registration-options', publicEndpoint, getRegistrationOptionsController);
  router.post('/register', publicEndpoint, registerInstitutionalAccountController);
  router.post('/register/confirm', publicEndpoint, confirmInstitutionalRegistrationController);
  router.post('/register/resend', publicEndpoint, resendInstitutionalConfirmationController);
  router.post('/register/complete', requireVerifiedIdentity, completeInstitutionalRegistrationController);
  router.get('/me', requireAuthentication, getAuthIdentityController);
  return router;
}
