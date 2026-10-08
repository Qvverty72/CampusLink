import { createModuleHealthCheck } from '../../services/module-health.js';
import { findAuthPermissions, findAuthProfile, findAuthRoles, findAuthUser, probeAuthDependencies } from './auth.repository.js';
import { ApiError } from '../../services/api-response.js';
import type { AuthAssignment, AuthAssignmentRow, VerifiedAuthConnection } from './auth.types.js';
import type { AuthHealth } from './auth.types.js';

export const getAuthHealth: () => Promise<AuthHealth> =
  createModuleHealthCheck('auth', probeAuthDependencies);

function assignments(rows: AuthAssignmentRow[], kind: 'rol' | 'permiso'): AuthAssignment[] {
  return rows.map(row => {
    const value = row[kind];
    if (!value || !value.id || !value.nombre || !row.campus_id) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account context is unavailable');
    }
    return { id: value.id, name: value.nombre, campusId: row.campus_id };
  });
}

// Fresh identity and PostgreSQL context on every call. This does not grant operation permissions.
export async function verifyAuthConnection(accessToken: string): Promise<VerifiedAuthConnection> {
  try {
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
      throw new ApiError(403, 'FORBIDDEN', 'An active account profile is required');
    }
    const [roles, permissions] = await Promise.all([
      findAuthRoles(accessToken, data.user.id),
      findAuthPermissions(accessToken, data.user.id),
    ]);
    if (roles.error || permissions.error || !roles.data || !permissions.data) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account context is unavailable');
    }
    return {
      userId: data.user.id,
      campusId: profile.data.campus_id,
      profile: profile.data,
      roles: assignments(roles.data, 'rol'),
      permissions: assignments(permissions.data, 'permiso'),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Authentication service is unavailable');
  }
}
