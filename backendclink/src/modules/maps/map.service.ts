import { createModuleHealthCheck } from '../../services/module-health.js';
import { findActiveMapByCampusId, isActiveCampus, probeMapDependencies } from './map.repository.js';
import type { MapHealth } from './map.types.js';

export const getMapHealth: () => Promise<MapHealth> = createModuleHealthCheck('maps', probeMapDependencies);

// Preserve the active-map DTO; do not expose a map with an absent/inactive campus reference.
export async function getActiveMap(campusId: string) {
  if (!await isActiveCampus(campusId)) return null;
  return findActiveMapByCampusId(campusId);
}
