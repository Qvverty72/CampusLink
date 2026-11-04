import type { ActivityDocument, ActivityDto, ActivityQuery } from '../types/activities.types.js';
import type { SpatialBuilding } from '../../maps/domain/map.location.js';
export { spatialBuildings } from '../../maps/domain/map.location.js';

export function resolveActivityLocation(buildings: SpatialBuilding[], location: ActivityDocument['location']): ActivityDto['location'] | null {
  if (!location || typeof location.buildingKey !== 'string' || typeof location.floorKey !== 'string') return null;
  const matches = buildings.filter(value => value.id === location.buildingKey);
  if (matches.length !== 1) return null;
  const building = matches[0];
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
