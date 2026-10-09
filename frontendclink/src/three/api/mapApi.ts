import type {
  BuildingConfig,
  BuildingId,
  FloorDefinition,
  FloorMeshConfig,
} from '@/three/types/map';


const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

type Vector3 = [number, number, number];
type ApiVector3 = string | number[];

interface ApiFloor {
  id: string;
  level: number;
  meshName: string;
  name: string;
  description: string;
  transform: {
    position: ApiVector3;
    rotation: ApiVector3;
    scale: ApiVector3;
  };
  subMeshes: string[];
  pois: unknown[];
}

interface ApiBuilding {
  id: string;
  name: string;
  focusTarget: number[];
  focusPosition: number[];
  floors: ApiFloor[];
}

interface ActiveCampusMapResponse {
  _id: string;
  version: number;
  campusId: string;
  status: 'ACTIVE';
  buildings: ApiBuilding[];
}

interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorDetail {
  field: string;
  message: string;
}

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface RuntimeMapData {
  campusId: string;
  version: number;
  buildingFloors: Record<BuildingId, string[]>;
  buildingConfigs: Record<BuildingId, BuildingConfig>;
  floorMeshConfigs: FloorMeshConfig[];
  floorData: Record<string, FloorDefinition>;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }

  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  try {
    const payload: unknown = await response.json();
    if (isApiErrorResponse(payload)) {
      return new ApiClientError(
        response.status,
        payload.error.code,
        payload.error.message,
        payload.error.details,
      );
    }
  } catch {
    // Preserve a stable fallback if a proxy or an older backend returns no JSON.
  }

  return new ApiClientError(
    response.status,
    'UNKNOWN_API_ERROR',
    `Request failed with status ${response.status}.`,
  );
}

// The active document currently serializes vectors as arrays, while older or
// manually-authored maps may use the space-delimited representation.
function parseVector3(value: ApiVector3, fieldName: string): Vector3 {
  const values = typeof value === 'string'
    ? value.trim().split(/\s+/).map(Number)
    : value;

  if (
    values.length !== 3 ||
    values.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`Invalid Vector3 received for ${fieldName}`);
  }

  return [values[0], values[1], values[2]];
}

export async function fetchActiveCampusMap(campusId: string, signal?: AbortSignal): Promise<RuntimeMapData> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId)) throw new Error('Invalid campus');
  const response = await fetch(
    `${API_BASE_URL}/api/v1/maps/${campusId}/active`, { signal }
  );

  if (!response.ok) {
    throw await toApiClientError(response);
  }

  const envelope = (await response.json()) as ApiSuccessResponse<ActiveCampusMapResponse>;
  const map = envelope.data;
  if (map.campusId.toLowerCase() !== campusId.toLowerCase()) throw new Error('El mapa recibido no corresponde a tu campus.');

  const buildingFloors = {} as Record<BuildingId, string[]>;
  const buildingConfigs = {} as Record<BuildingId, BuildingConfig>;
  const floorData: Record<string, FloorDefinition> = {};
  const floorMeshConfigs: FloorMeshConfig[] = [];

  for (const building of map.buildings) {
    const buildingId = building.id as BuildingId;

    buildingFloors[buildingId] = building.floors.map(
      (floor) => floor.meshName
    );

    buildingConfigs[buildingId] = {
      id: buildingId,
      name: building.name,
      floors: buildingFloors[buildingId],
      focusTarget: parseVector3(building.focusTarget, 'focusTarget'),
      focusPosition: parseVector3(building.focusPosition, 'focusPosition'),
    };

    for (const floor of building.floors) {
      const position = parseVector3(
        floor.transform.position,
        `${floor.meshName}.transform.position`
      );
      const rotation = parseVector3(
        floor.transform.rotation,
        `${floor.meshName}.transform.rotation`
      );
      const scaleVector = parseVector3(
        floor.transform.scale,
        `${floor.meshName}.transform.scale`
      );

      const scale =
        scaleVector[0] === scaleVector[1] &&
        scaleVector[1] === scaleVector[2]
          ? scaleVector[0]
          : scaleVector;

      floorMeshConfigs.push({
        meshName: floor.meshName,
        buildingId,
        position,
        rotation,
        scale,
        subMeshes: floor.subMeshes,
      });

      floorData[floor.meshName] = {
        id: floor.id,
        buildingId,
        level: floor.level,
        meshName: floor.meshName,
        name: floor.name,
        description: floor.description,
      };
    }
  }

  return {
    campusId: map.campusId,
    version: map.version,
    buildingFloors,
    buildingConfigs,
    floorMeshConfigs,
    floorData,
  };
}
