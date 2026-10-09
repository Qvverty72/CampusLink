import { createModuleHealthCheck } from '../../services/module-health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { CampusMapDocument, MapHealth } from './map.types.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import { ApiError } from '../../services/api-response.js';

export type ActiveMapLookup = (
  campusId: string,
) => Promise<CampusMapDocument | null>;

async function probeMapDependencies(): Promise<DependencyChecks> {
  const { probeMapDependencies: probe } = await import('./map.repository.js');
  return probe();
}

export const getMapHealth: () => Promise<MapHealth> = createModuleHealthCheck('maps', probeMapDependencies);

// Preserve the active-map DTO; do not expose a map with an absent/inactive campus reference.
export async function getActiveMap(campusId: string) {
  const { findActiveMapByCampusId, isActiveCampus } = await import('./map.repository.js');
  if (!await isActiveCampus(campusId)) return null;
  return findActiveMapByCampusId(campusId);
}

export async function getAuthorizedActiveMap(auth: VerifiedAuthConnection, campusId: string, lookup: ActiveMapLookup = getActiveMap) {
  // Browsing the map follows the current profile campus, including after a move.
  if (campusId.toLowerCase() !== auth.campusId) {
    throw new ApiError(403, 'FORBIDDEN', 'Solo puedes consultar el mapa de tu campus vigente.');
  }
  requireCampusCapability(auth, auth.campusId, 'general');
  const map = await lookup(auth.campusId);
  // Inspect the actual document as well as the requested path before exposing it.
  if (!map || map.campusId !== auth.campusId || map.status !== 'ACTIVE') {
    throw new ApiError(404, 'NOT_FOUND', 'Active campus map not found.');
  }
  return map;
}
