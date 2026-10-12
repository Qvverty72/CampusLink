import type { CampusMapDocument } from '../maps/map.types.js';
import type { ActivityDocument, ActivityDto, ActivityQuery } from './activities.types.js';

interface SpatialPoi { poiKey: string; name: string; isVisible: boolean; deletedAt?: unknown }
interface SpatialFloor { id: string; name: string; pois: SpatialPoi[]; deletedAt?: unknown; isVisible?: boolean }
interface SpatialBuilding { id: string; name: string; floors: SpatialFloor[]; deletedAt?: unknown; isVisible?: boolean }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read identifiers from map data; meshName never participates in activity references. */
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

export function resolveActivityLocation(buildings: SpatialBuilding[], location: ActivityDocument['location']): ActivityDto['location'] | null {
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null;
  for (const key of ['buildingKey','floorKey','poiKey'] as const) {
    if (location[key] !== undefined && !(key === 'poiKey' && location[key] === null)
      && (typeof location[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(location[key]!))) return null;
  }
  if ((location.floorKey && !location.buildingKey) || (location.poiKey && (!location.buildingKey || !location.floorKey))) return null;
  const label = typeof location.customLabel === 'string' && location.customLabel.trim() ? { customLabel: location.customLabel.trim() } : {};
  // Empty hierarchy means the current campus; no invented building or floor IDs.
  if (!location.buildingKey) return label;
  const matches = buildings.filter(value => value.id === location.buildingKey);
  if (matches.length !== 1) return null;
  const building = matches[0];
  if (!location.floorKey) return { buildingKey: building.id, buildingName: building.name, ...label };
  const floors = building.floors.filter(value => value.id === location.floorKey);
  if (floors.length !== 1) return null;
  const floor = floors[0];
  const poiMatches = location.poiKey ? floor.pois.filter(value => value.poiKey === location.poiKey) : [];
  if (location.poiKey && poiMatches.length !== 1) return null;
  const poi = poiMatches[0];
  return {
    buildingKey: building.id, buildingName: building.name,
    floorKey: floor.id, floorName: floor.name,
    ...(poi ? { poiKey: poi.poiKey, poiName: poi.name } : {}),
    ...(typeof location.customLabel === 'string' && location.customLabel.trim()
      ? { customLabel: location.customLabel.trim() } : {}),
  };
}

export function hasActivityLocation(buildings: SpatialBuilding[], query: ActivityQuery): boolean {
  if (!query.buildingKey) return true;
  const building = buildings.find(value => value.id === query.buildingKey);
  if (!building) return false;
  if (!query.floorKey) return true;
  const floor = building.floors.find(value => value.id === query.floorKey);
  if (!floor) return false;
  return !query.poiKey || floor.pois.some(value => value.poiKey === query.poiKey);
}
