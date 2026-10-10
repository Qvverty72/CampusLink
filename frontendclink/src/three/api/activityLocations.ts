import type { ActivityLocationOption } from '@/features/activities/types/creation';
import type { RuntimeMapData } from './mapApi';

/** Strip render metadata before handing the domain catalog to activity forms. */
export function activityLocations(map: RuntimeMapData): ActivityLocationOption[] {
  return Object.values(map.buildingConfigs).map(building => ({ id: building.id, name: building.name,
    floors: Object.values(map.floorData).filter(floor => floor.buildingId === building.id)
      .sort((a, b) => a.level - b.level).map(floor => ({ id: floor.id, name: floor.name,
        pois: (floor.pois ?? []).filter(poi => poi.isVisible === true && !poi.deletedAt)
          .map(poi => ({ id: poi.poiKey, name: poi.name })),
      })),
  })).filter(building => building.floors.length > 0);
}
