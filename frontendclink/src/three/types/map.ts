/**
 * Contratos compartidos por la configuración, la escena 3D y el store del mapa.
 * Los nombres de mesh conectan metadata lógica con nodos reales del GLB.
 */

/**
 * Identificadores conocidos por el modelo. La API se adapta mediante un cast y no
 * valida en runtime que `building.id` pertenezca a esta unión; el mapa publicado
 * debe usar IDs compatibles con el cliente y con los nodos del GLB.
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

/** Punto de interés recibido dentro de un piso del mapa activo. */
export interface PointOfInterestDefinition {
  poiKey: string;
  name: string;
  type: string;
  icon: string;
  description?: string | null;
  /** Nombres de archivo empaquetados en assets/images/poimages; no rutas del dispositivo. */
  imageKeys?: string[];
  /** Coordenadas relativas al piso; conserva el vínculo espacial del documento. */
  position: { x: number; y: number; z: number };
  isFixed: boolean;
  isVisible: boolean;
  deletedAt?: string | null;
}

/** Metadata descriptiva de un piso; no contiene geometría de Three.js. */
export interface FloorDefinition {
  /** Identificador único, por ejemplo `ebuilding-floor-1`. */
  id: string;
  /** Edificio al que pertenece. */
  buildingId: BuildingId;
  /** Nivel lógico firmado; admite subterráneos negativos y niveles históricos. */
  level: number;
  /** Nombre del grupo del piso en el modelo GLB, por ejemplo `ebuilding_floor1`. */
  meshName: string;
  /** Nombre legible que se muestra en pantalla. */
  name: string;
  /** Descripción mostrada en el modal. */
  description: string;
  /** El mapa de API siempre las incluye; opcional para la configuración mock histórica. */
  pois?: PointOfInterestDefinition[];
}

/** Configuración lógica de un edificio y de la vista de cámara que lo encuadra. */
export interface BuildingConfig {
  id: BuildingId;
  /** Nombre legible del edificio. */
  name: string;
  /** Nombres de los grupos de piso del edificio. */
  floors: string[];
  /** Posición objetivo de cámara [x, y, z] al seleccionar el edificio. */
  focusTarget: [number, number, number];
  /** Posición de cámara [x, y, z] al acercarse al edificio. */
  focusPosition: [number, number, number];
}

/**
 * Puente entre la metadata de un piso y la geometría local del GLB.
 *
 * Un piso lógico puede estar fragmentado en varios nodos por material. El render
 * reconstruye esa unidad mediante `subMeshes` y aplica un único transform al group.
 */
export interface FloorMeshConfig {
  /** Identificador del piso, por ejemplo `ebuilding_floor1`. */
  meshName: string;
  /** Edificio al que pertenece. */
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
