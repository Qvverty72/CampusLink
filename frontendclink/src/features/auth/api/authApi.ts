import { authenticatedRequest } from '@/lib/api/authenticated-request';
import type { AuthIdentity } from '../types/auth';

export const loadAuthIdentity = (signal: AbortSignal) =>
  authenticatedRequest<AuthIdentity>('/api/v1/auth/me', { signal });
