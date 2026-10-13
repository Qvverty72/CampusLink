import type { ActivityLocationOption } from '@/features/activities/types/creation';
import type { RuntimeMapData } from './mapApi';

/** Renamed floor labels can use a different number from the map's rendering level. */
function displayFloorLevel(floor: { name: string; level: number }): number {
  const match = /\bpiso\s*([+\-\u2212]?\s*\d+)\b/iu.exec(floor.name);
  const visibleLevel = match ? Number(match[1].replace(/\s/g, '').replace('\u2212', '-')) : NaN;
  return Number.isSafeInteger(visibleLevel) ? visibleLevel : floor.level;
}

/** Strip render metadata before handing the domain catalog to activity forms. */
export function activityLocations(map: RuntimeMapData): ActivityLocationOption[] {
  return Object.values(map.buildingConfigs)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }))
    .map(building => ({ id: building.id, name: building.name,
    floors: Object.values(map.floorData).filter(floor => floor.buildingId === building.id)
      .sort((a, b) => {
        const aLevel = displayFloorLevel(a);
        const bLevel = displayFloorLevel(b);
        // Surface/upper floors first, then basements from nearest to deepest.
        if ((aLevel < 0) !== (bLevel < 0)) return aLevel < 0 ? 1 : -1;
        return aLevel < 0 ? bLevel - aLevel : aLevel - bLevel;
      }).map(floor => ({ id: floor.id, name: floor.name,
        pois: (floor.pois ?? []).filter(poi => poi.isVisible === true && !poi.deletedAt)
          .map(poi => ({ id: poi.poiKey, name: poi.name })),
      })),
  })).filter(building => building.floors.length > 0);
}
