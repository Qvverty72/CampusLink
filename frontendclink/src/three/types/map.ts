/**
 * Contratos compartidos por la configuración, la escena 3D y el store del mapa.
 * Los nombres de mesh conectan metadata lógica con nodos reales del GLB.
 */

/**
 * Identificadores lógicos actuales de edificios. Hoy son una unión local cerrada;
 * al consumir la API deberán corresponder a los `building.id` del mapa ACTIVE.
 */
export type BuildingId =
  | 'dbuilding'
  | 'ebuilding'
  | 'fbuilding'
  | 'gbuilding'
  | 'cabin01'
  | 'cabin02'
  | 'cabin03'
  | 'hbuilding'
  | 'cti'
  | 'gym';

/** Metadata descriptiva de un piso; no contiene geometría de Three.js. */
export interface FloorDefinition {
  /** Unique identifier, e.g. 'ebuilding-floor-1' */
  id: string;
  /** Parent building */
  buildingId: BuildingId;
  /** Floor level number (1-indexed) */
  level: number;
  /** Floor group name in the GLB model, e.g. 'ebuilding_floor1' */
  meshName: string;
  /** Human-readable display name */
  name: string;
  /** Description shown in the modal */
  description: string;
}

/** Configuración lógica de un edificio y de la vista de cámara que lo encuadra. */
export interface BuildingConfig {
  id: BuildingId;
  /** Human-readable building name */
  name: string;
  /** List of floor group names for each floor */
  floors: string[];
  /** Camera target position [x, y, z] when building is selected */
  focusTarget: [number, number, number];
  /** Camera position [x, y, z] when zoomed into building */
  focusPosition: [number, number, number];
}

/**
 * Puente entre la metadata de un piso y la geometría local del GLB.
 *
 * Un piso lógico puede estar fragmentado en varios nodos por material. El render
 * reconstruye esa unidad mediante `subMeshes` y aplica un único transform al group.
 */
export interface FloorMeshConfig {
  /** Floor identifier, e.g. 'ebuilding_floor1' */
  meshName: string;
  /** Parent building */
  buildingId: BuildingId;
  /** Posición original XYZ respecto de la raíz del modelo. Y representa altura. */
  position: [number, number, number];
  /** Rotación Euler original del group, en radianes y orden de Three.js. */
  rotation?: [number, number, number];
  /** Escala original, uniforme o independiente por eje. */
  scale?: number | [number, number, number];
  /** Nombres exactos de los nodos geométricos que componen el piso. */
  subMeshes: string[];
}

/**
 * Estado transitorio de interacción compartido por Canvas y overlays nativos.
 * No representa el documento persistido en MongoDB.
 */
export interface MapState {
  selectedBuilding: BuildingId | null;
  selectedFloor: string | null;
  isExploded: boolean;
  isFloorModalOpen: boolean;

  selectBuilding: (buildingId: BuildingId) => void;
  selectFloor: (floorId: string) => void;
  closeFloorModal: () => void;
  resetBuilding: () => void;
}
