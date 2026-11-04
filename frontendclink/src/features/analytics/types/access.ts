import type { AuthIdentity } from '@/features/auth/types/auth';

/** Puerta visual para todas las sedes con reportería; la API confirma su institución y vigencia. */
export function canAccessAnalytics(identity: AuthIdentity | null | undefined): boolean {
  return Boolean(identity && identity.profile.estado_cuenta === 'ACTIVA' && !identity.profile.deleted_at
    && identity.roles.some(role => role.name === 'ADMINISTRADOR'
    || (role.name === 'USUARIO_AUTORIZADO' && identity.permissions.some(permission =>
      permission.campusId === role.campusId && permission.name === 'ACCEDER_REPORTERIA'))));
}
