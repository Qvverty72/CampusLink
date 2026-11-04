import type { CampusMapDocument } from '../types/map.types.js';

interface SpatialPoi { poiKey: string; name: string; isVisible: boolean; deletedAt?: unknown }
interface SpatialFloor { id: string; name: string; pois: SpatialPoi[]; deletedAt?: unknown; isVisible?: boolean }
export interface SpatialBuilding { id: string; name: string; floors: SpatialFloor[]; deletedAt?: unknown; isVisible?: boolean }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Extrae ubicaciones visibles del mapa; los nombres de mesh no son referencias de dominio. */
export function spatialBuildings(map: CampusMapDocument): SpatialBuilding[] {
  return map.buildings.flatMap(value => {
    if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string'
      || value.deletedAt || value.isVisible === false || !Array.isArray(value.floors)) return [];
    const floors: SpatialFloor[] = value.floors.flatMap(floor => {
      if (!record(floor) || typeof floor.id !== 'string' || typeof floor.name !== 'string'
        || floor.deletedAt || floor.isVisible === false) return [];
      const pois: SpatialPoi[] = Array.isArray(floor.pois) ? floor.pois.flatMap(poi => {
        if (!record(poi) || typeof poi.poiKey !== 'string' || typeof poi.name !== 'string'
          || poi.isVisible !== true || poi.deletedAt) return [];
        return [{ poiKey: poi.poiKey, name: poi.name, isVisible: true }];
      }) : [];
      return [{ id: floor.id, name: floor.name, pois }];
    });
    return [{ id: value.id, name: value.name, floors }];
  });
}
