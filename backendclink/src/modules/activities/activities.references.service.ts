import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import type { ActivityDependencies } from './activities.service.js';
import { ApiError } from '../../shared/errors/api-error.js';

export const relationalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La identidad propia proviene del perfil vigente verificado en esta solicitud.
 * Los demás creadores se verifican en PostgreSQL antes de exponer documentos Mongo.
 * Ausencia/inactividad oculta contenido operacional; fallo de BD devuelve 503, nunca una lista engañosamente vacía.
 */
export async function validActivityCreators(auth: VerifiedAuthConnection, userIds: string[], dependencies: ActivityDependencies) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const ids = [...new Set(userIds.filter(id => typeof id === 'string' && relationalUuid.test(id)))];
  const others = ids.filter(id => id !== auth.userId);
  let result = new Map<string, string>();
  try {
    if (others.length) {
      if (dependencies.findValidCreators) result = await dependencies.findValidCreators(auth.campusId, others);
      else if (dependencies.findOrganizer) {
        for (const id of others) {
          const organizer = await dependencies.findOrganizer(id, auth.campusId);
          if (organizer) result.set(id, organizer.name);
        }
      } else result = await (await import('./activities.references.repository.js')).findValidActivityCreators(auth.campusId, others);
    }
  } catch { throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity references are temporarily unavailable.'); }
  if (ids.includes(auth.userId) && auth.profile.campus_id === auth.campusId) result.set(auth.userId, auth.profile.nombre_completo);
  return result;
}
