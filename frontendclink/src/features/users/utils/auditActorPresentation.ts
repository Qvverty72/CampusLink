import type { AuditActor } from '../types/audit';

/** Solo presenta la clasificación del servidor. La acción y la identidad del observador no determinan al responsable. */
export function auditActorLabel(actorId: string | null, actor?: AuditActor) {
  if (!actorId) return 'Responsable no registrado';
  if (actor?.kind === 'administrator') return 'Administrador';
  if (actor?.kind === 'authorized') return actor.permissions.length ? 'Usuario con permisos' : 'Usuario autorizado';
  if (actor?.kind === 'user') return 'Usuario';
  return 'Tipo no disponible';
}
