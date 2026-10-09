import { createModuleHealthCheck } from '../../services/module-health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { CampusMapDocument, MapHealth } from './map.types.js';

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
