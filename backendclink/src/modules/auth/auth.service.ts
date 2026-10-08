import { createModuleHealthCheck } from '../../services/module-health.js';
import { findAuthProfile, findAuthUser, probeAuthDependencies } from './auth.repository.js';
import { ApiError } from '../../services/api-response.js';
import type { VerifiedAuthConnection } from './auth.types.js';
import type { AuthHealth } from './auth.types.js';

export const getAuthHealth: () => Promise<AuthHealth> =
  createModuleHealthCheck('auth', probeAuthDependencies);

// Diagnostic helper for integration checks; not an authorization grant or login endpoint.
export async function verifyAuthConnection(accessToken: string): Promise<VerifiedAuthConnection> {
  if (!accessToken.trim()) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  const { data, error } = await findAuthUser(accessToken);
  if (error) {
    if ([400, 401, 403].includes(error.status ?? 0)) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
    }
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Authentication service is unavailable');
  }
  if (!data.user) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  const profile = await findAuthProfile(accessToken, data.user.id);
  if (profile.error) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Profile service is unavailable');
  if (!profile.data || profile.data.id !== data.user.id || profile.data.estado_cuenta !== 'ACTIVA' || profile.data.deleted_at) {
    throw new ApiError(403, 'FORBIDDEN', 'An active institutional profile is required');
  }
  return { userId: data.user.id, campusId: profile.data.campus_id };
}
