import type { AuditActor, AuditActorRow } from '../types/access.types.js';

/** Describe asignaciones del responsable; nunca concede autorización ni infiere su perfil por la acción. */
export function auditActor(row?: AuditActorRow): AuditActor {
  if (!row?.available) return { kind: 'unknown', source: 'unavailable', name: null, roles: [], permissions: [] };
  const kind = row.roles.includes('ADMINISTRADOR') ? 'administrator'
    : row.roles.includes('USUARIO_AUTORIZADO') || row.permissions.length > 0 ? 'authorized'
      : row.roles.length ? 'unknown' : 'user';
  return { kind, source: 'assignment_history', name: row.name, roles: row.roles, permissions: row.permissions };
}
