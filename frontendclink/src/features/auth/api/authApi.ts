import { authenticatedRequest } from '@/lib/api/authenticated-request';
import type { AuthIdentity } from '../types/auth';

/** Consulta al backend la identidad, perfil y capacidades de la sesión vigente. */
export const loadAuthIdentity = (signal: AbortSignal) =>
  authenticatedRequest<AuthIdentity>('/api/v1/auth/me', { signal });
