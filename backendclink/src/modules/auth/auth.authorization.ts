import { ApiError } from '../../services/api-response.js';
import type { AuthProfile, VerifiedAuthConnection } from './auth.types.js';

export function requireActiveAccount(profile: Pick<AuthProfile, 'id'> & { estado_cuenta: string; deleted_at: unknown }, userId: string) {
  if (profile.id !== userId || profile.estado_cuenta !== 'ACTIVA' || profile.deleted_at) {
    throw new ApiError(403, 'FORBIDDEN', 'An active account profile is required');
  }
}

// The approved matrix also supplies /me. Campus grants are explicit; a verified
// profile alone supplies general functions only in its current campus.
export function accountCapabilities(context: VerifiedAuthConnection, campusId = context.campusId) {
  const localRoles = context.roles.filter(role => role.campusId === campusId);
  const admin = localRoles.some(role => role.name === 'ADMINISTRADOR');
  const authorized = localRoles.some(role => role.name === 'USUARIO_AUTORIZADO');
  const has = (name: string) => admin || (authorized && context.permissions.some(permission =>
    permission.campusId === campusId && permission.name === name));
  return {
    general: admin || authorized || (campusId === context.campusId && Boolean(context.profile.verificado_en)),
    officialActivities: has('PUBLICAR_EVENTO'),
    analytics: has('ACCEDER_ANALITICA'),
    reports: has('ACCEDER_REPORTERIA'),
  };
}

export type CampusCapability = keyof ReturnType<typeof accountCapabilities> | 'administration';

// Call after the identity middleware and with campus from the persisted resource
// or a server-validated creation context, never a body-supplied privilege.
export function requireCampusCapability(context: VerifiedAuthConnection, campusId: string, capability: CampusCapability) {
  requireActiveAccount(context.profile, context.userId);
  const allowed = capability === 'administration'
    ? context.roles.some(role => role.campusId === campusId && role.name === 'ADMINISTRADOR')
    : accountCapabilities(context, campusId)[capability] === true;
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'No tienes autorización para esta operación en este campus.');
}

export function requireResourceOwner(context: VerifiedAuthConnection, ownerId: string) {
  requireActiveAccount(context.profile, context.userId);
  // Ownership is a separate condition. An administrative exception must be
  // declared by the particular operation; no implicit override is introduced.
  if (ownerId !== context.userId) throw new ApiError(403, 'FORBIDDEN', 'Solo el propietario puede realizar esta operación.');
}
