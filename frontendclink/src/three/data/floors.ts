/**
 * Configuración lógica y metadata local del mapa 3D actual.
 *
 * El GLB aporta geometría y materiales; este archivo decide cómo agrupar sus nodos
 * en edificios/pisos interactivos, qué transforms conservar, cómo enfocar la cámara
 * y qué texto mostrar. Hoy es la fuente del frontend y del seed MongoDB.
 *
 * La integración futura reemplazará estas estructuras productivas con la respuesta
 * de `GET /api/v1/maps/:campusId/active`. El GLB seguirá siendo un asset local y
 * `meshName`/`subMeshes` continuarán enlazando la respuesta con sus nodos.
 */

import type { BuildingId, BuildingConfig, FloorDefinition, FloorMeshConfig } from '@/three/types/map';

// ─── Building → Floor Names ───────────────────────────────────────────────────

/**
 * Ordena los pisos dentro de cada edificio. El orden define tanto el nivel lógico
 * como el índice usado para separar verticalmente el exploded view.
 */
export const buildingFloors: Record<BuildingId, string[]> = {
  cabin01: ['cabin01_floor1', 'cabin01_floor2', 'cabin01_floor3'],
  cabin02: ['cabin02_floor1', 'cabin02_floor2', 'cabin02_floor3'],
  cabin03: ['cabin03_floor1', 'cabin03_floor2', 'cabin03_floor3'],
  dbuilding: ['dbuilding_floor1'],
  ebuilding: [
    'ebuilding_floor1',
    'ebuilding_floor2',
    'ebuilding_floor3',
    'ebuilding_floor4',
    'ebuilding_floor5',
  ],
  fbuilding: [
    'fbuilding_floor1',
    'fbuilding_floor2',
    'fbuilding_floor3',
    'fbuilding_floor4',
  ],
  gbuilding: [
    'gbuilding_floor1',
    'gbuilding_floor2',
    'gbuilding_floor3',
    'gbuilding_floor4',
  ],
  hbuilding: [
    'hbuilding_floor1',
    'hbuilding_floor2',
    'hbuilding_floor3',
    'hbuilding_floor4',
    'hbuilding_floor5',
    'hbuilding_floor6',
    'hbuilding_floor7',
    'hbuilding_floor8',
  ],
  cti: ['cti_floor1'],
  gym: ['gym_floor1'],
};

// ─── Floor Mesh Configurations (positions + sub-meshes from gltfjsx) ──────────

/**
 * Reconstruye cada piso lógico a partir de varios submeshes del GLB.
 *
 * `position`, `rotation` y `scale` provienen de la salida de gltfjsx y colocan el
 * group en el mismo sistema de coordenadas de la escena. Los submeshes conservan
 * su geometría/material, mientras el transform y la animación pertenecen al group.
 */
export const floorMeshConfigs: FloorMeshConfig[] = [
  // ── Cabin 01 ──────────────────────────────────────────────────────────────
  {
    meshName: 'cabin01_floor1',
    buildingId: 'cabin01',
    position: [0.09683656, 0.06523443, 0.09987102],
    subMeshes: [
      'cabin01_floor1_Mesh001', 'cabin01_floor1_Mesh001_1', 'cabin01_floor1_Mesh001_2',
      'cabin01_floor1_Mesh001_3', 'cabin01_floor1_Mesh001_4',
    ],
  },
  {
    meshName: 'cabin01_floor2',
    buildingId: 'cabin01',
    position: [0.09683656, 0.07815167, 0.09987102],
    subMeshes: [
      'cabin01_floor1_Mesh', 'cabin01_floor1_Mesh_1', 'cabin01_floor1_Mesh_2',
      'cabin01_floor1_Mesh_3', 'cabin01_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'cabin01_floor3',
    buildingId: 'cabin01',
    position: [0.0969923, 0.0954479, 0.10072065],
    subMeshes: [
      'cabin01_floor2_Mesh', 'cabin01_floor2_Mesh_1', 'cabin01_floor2_Mesh_2',
      'cabin01_floor2_Mesh_3', 'cabin01_floor2_Mesh_4', 'cabin01_floor2_Mesh_5',
    ],
  },

  // ── Cabin 02 ──────────────────────────────────────────────────────────────
  {
    meshName: 'cabin02_floor1',
    buildingId: 'cabin02',
    position: [0.17350294, 0.06532428, 0.06341653],
    subMeshes: [
      'cabin02_floor1_Mesh001', 'cabin02_floor1_Mesh001_1', 'cabin02_floor1_Mesh001_2',
      'cabin02_floor1_Mesh001_3', 'cabin02_floor1_Mesh001_4',
    ],
  },
  {
    meshName: 'cabin02_floor2',
    buildingId: 'cabin02',
    position: [0.17350294, 0.0781678, 0.06341653],
    subMeshes: [
      'cabin02_floor1_Mesh', 'cabin02_floor1_Mesh_1', 'cabin02_floor1_Mesh_2',
      'cabin02_floor1_Mesh_3', 'cabin02_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'cabin02_floor3',
    buildingId: 'cabin02',
    position: [0.17356263, 0.09600329, 0.06293174],
    subMeshes: [
      'cabin02_floor2_Mesh', 'cabin02_floor2_Mesh_1', 'cabin02_floor2_Mesh_2',
      'cabin02_floor2_Mesh_3', 'cabin02_floor2_Mesh_4', 'cabin02_floor2_Mesh_5',
    ],
  },

  // ── Cabin 03 ──────────────────────────────────────────────────────────────
  {
    meshName: 'cabin03_floor1',
    buildingId: 'cabin03',
    position: [0.2185794, 0.0654091, -0.00165834],
    subMeshes: [
      'cabin03_floor1_Mesh001', 'cabin03_floor1_Mesh001_1', 'cabin03_floor1_Mesh001_2',
      'cabin03_floor1_Mesh001_3', 'cabin03_floor1_Mesh001_4',
    ],
  },
  {
    meshName: 'cabin03_floor2',
    buildingId: 'cabin03',
    position: [0.2185794, 0.0781755, -0.00165834],
    subMeshes: [
      'cabin03_floor1_Mesh', 'cabin03_floor1_Mesh_1', 'cabin03_floor1_Mesh_2',
      'cabin03_floor1_Mesh_3', 'cabin03_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'cabin03_floor3',
    buildingId: 'cabin03',
    position: [0.21828732, 0.09617037, -0.0019014],
    subMeshes: [
      'cabin03_floor2_Mesh', 'cabin03_floor2_Mesh_1', 'cabin03_floor2_Mesh_2',
      'cabin03_floor2_Mesh_3', 'cabin03_floor2_Mesh_4', 'cabin03_floor2_Mesh_5',
    ],
  },

  // ── CTI ────────────────────────────────────────────────────────────────────
  {
    meshName: 'cti_floor1',
    buildingId: 'cti',
    position: [-0.09296654, 0.00503574, 0.45533523],
    rotation: [0, -0.02192614, 0],
    scale: 1.24738979,
    subMeshes: [
      'cti_floor1_Mesh001', 'cti_floor1_Mesh001_1', 'cti_floor1_Mesh001_2',
      'cti_floor1_Mesh001_3', 'cti_floor1_Mesh001_4', 'cti_floor1_Mesh001_5',
      'cti_floor1_Mesh001_6', 'cti_floor1_Mesh001_7',
    ],
  },

  // ── D-Building ─────────────────────────────────────────────────────────────
  {
    meshName: 'dbuilding_floor1',
    buildingId: 'dbuilding',
    position: [0.01693383, 0.09075969, 0.06553093],
    subMeshes: [
      'dbuilding_floor1_Mesh', 'dbuilding_floor1_Mesh_1', 'dbuilding_floor1_Mesh_2',
      'dbuilding_floor1_Mesh_3', 'dbuilding_floor1_Mesh_4', 'dbuilding_floor1_Mesh_5',
    ],
  },

  // ── E-Building ─────────────────────────────────────────────────────────────
  {
    meshName: 'ebuilding_floor1',
    buildingId: 'ebuilding',
    position: [0.01866287, 0.09097074, -0.071018],
    subMeshes: [
      'ebuilding_floor1_Mesh001', 'ebuilding_floor1_Mesh001_1', 'ebuilding_floor1_Mesh001_2',
      'ebuilding_floor1_Mesh001_3', 'ebuilding_floor1_Mesh001_4', 'ebuilding_floor1_Mesh001_5',
    ],
  },
  {
    meshName: 'ebuilding_floor2',
    buildingId: 'ebuilding',
    position: [0.01889805, 0.10393097, -0.07490823],
    subMeshes: [
      'ebuilding_floor2_Mesh001', 'ebuilding_floor2_Mesh001_1', 'ebuilding_floor2_Mesh001_2',
      'ebuilding_floor2_Mesh001_3', 'ebuilding_floor2_Mesh001_4', 'ebuilding_floor2_Mesh001_5',
    ],
  },
  {
    meshName: 'ebuilding_floor3',
    buildingId: 'ebuilding',
    position: [0.01889805, 0.11693096, -0.07490823],
    subMeshes: [
      'ebuilding_floor3_Mesh001', 'ebuilding_floor3_Mesh001_1', 'ebuilding_floor3_Mesh001_2',
      'ebuilding_floor3_Mesh001_3', 'ebuilding_floor3_Mesh001_4', 'ebuilding_floor3_Mesh001_5',
    ],
  },
  {
    meshName: 'ebuilding_floor4',
    buildingId: 'ebuilding',
    position: [0.01889805, 0.12993096, -0.07490825],
    subMeshes: [
      'ebuilding_floor4_Mesh001', 'ebuilding_floor4_Mesh001_1', 'ebuilding_floor4_Mesh001_2',
      'ebuilding_floor4_Mesh001_3', 'ebuilding_floor4_Mesh001_4', 'ebuilding_floor4_Mesh001_5',
    ],
  },
  {
    meshName: 'ebuilding_floor5',
    buildingId: 'ebuilding',
    position: [0.02078407, 0.14320296, -0.07352281],
    subMeshes: [
      'ebuilding_floor5_Mesh001', 'ebuilding_floor5_Mesh001_1', 'ebuilding_floor5_Mesh001_2',
      'ebuilding_floor5_Mesh001_3', 'ebuilding_floor5_Mesh001_4',
    ],
  },

  // ── F-Building ─────────────────────────────────────────────────────────────
  ...([
    [1, [0.07641956, 0.09085523, -0.06767353]],
    [2, [0.07634686, 0.10385524, -0.06772478]],
    [3, [0.07634706, 0.11685523, -0.06772464]],
    [4, [0.07634293, 0.12985523, -0.06772754]],
  ] as const).map(([level, position]) => ({
    meshName: `fbuilding_floor${level}`,
    buildingId: 'fbuilding' as const,
    position: [...position] as [number, number, number],
    subMeshes: Array.from(
      { length: 6 },
      (_, index) => `fbuilding_floor${level}_Mesh${index === 0 ? '' : `_${index}`}`
    ),
  })),

  // ── G-Building ─────────────────────────────────────────────────────────────
  ...([
    [1, [0.08372448, 0.09106029, -0.11372714]],
    [2, [0.08364504, 0.10406029, -0.11378279]],
    [3, [0.08364525, 0.11706029, -0.11378263]],
    [4, [0.08364075, 0.13006029, -0.1137858]],
  ] as const).map(([level, position]) => ({
    meshName: `gbuilding_floor${level}`,
    buildingId: 'gbuilding' as const,
    position: [...position] as [number, number, number],
    subMeshes: Array.from(
      { length: 6 },
      (_, index) => `gbuilding_floor${level}_Mesh${index === 0 ? '' : `_${index}`}`
    ),
  })),

  // ── Gym ────────────────────────────────────────────────────────────────────
  {
    meshName: 'gym_floor1',
    buildingId: 'gym',
    position: [0.45241207, 0.00340825, 0.40112868],
    subMeshes: [
      'gym_floor1_Mesh001', 'gym_floor1_Mesh001_1', 'gym_floor1_Mesh001_2',
      'gym_floor1_Mesh001_3', 'gym_floor1_Mesh001_4', 'gym_floor1_Mesh001_5',
      'gym_floor1_Mesh001_6', 'gym_floor1_Mesh001_7',
    ],
  },

  // ── H-Building ─────────────────────────────────────────────────────────────
  {
    meshName: 'hbuilding_floor1',
    buildingId: 'hbuilding',
    position: [0.04087868, -0.00003838, 0.21824084],
    subMeshes: [
      'hbuilding_floor1_Mesh', 'hbuilding_floor1_Mesh_1', 'hbuilding_floor1_Mesh_2',
      'hbuilding_floor1_Mesh_3', 'hbuilding_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'hbuilding_floor2',
    buildingId: 'hbuilding',
    position: [0.04087869, 0.01296162, 0.21824086],
    subMeshes: [
      'hbuilding_floor2_Mesh', 'hbuilding_floor2_Mesh_1', 'hbuilding_floor2_Mesh_2',
      'hbuilding_floor2_Mesh_3', 'hbuilding_floor2_Mesh_4',
    ],
  },
  {
    meshName: 'hbuilding_floor3',
    buildingId: 'hbuilding',
    position: [0.04239638, 0.0260283, 0.2219485],
    subMeshes: [
      'hbuilding_floor3_Mesh', 'hbuilding_floor3_Mesh_1', 'hbuilding_floor3_Mesh_2',
      'hbuilding_floor3_Mesh_3', 'hbuilding_floor3_Mesh_4', 'hbuilding_floor3_Mesh_5',
    ],
  },
  {
    meshName: 'hbuilding_floor4',
    buildingId: 'hbuilding',
    position: [0.04328107, 0.0390283, 0.22180475],
    subMeshes: [
      'hbuilding_floor4_Mesh', 'hbuilding_floor4_Mesh_1', 'hbuilding_floor4_Mesh_2',
      'hbuilding_floor4_Mesh_3', 'hbuilding_floor4_Mesh_4', 'hbuilding_floor4_Mesh_5',
    ],
  },
  {
    meshName: 'hbuilding_floor5',
    buildingId: 'hbuilding',
    position: [0.04328109, 0.0520283, 0.22180475],
    subMeshes: [
      'hbuilding_floor5_Mesh', 'hbuilding_floor5_Mesh_1', 'hbuilding_floor5_Mesh_2',
      'hbuilding_floor5_Mesh_3', 'hbuilding_floor5_Mesh_4', 'hbuilding_floor5_Mesh_5',
    ],
  },
  {
    meshName: 'hbuilding_floor6',
    buildingId: 'hbuilding',
    position: [0.04294846, 0.06535606, 0.22161679],
    subMeshes: [
      'hbuilding_floor6_Mesh', 'hbuilding_floor6_Mesh_1', 'hbuilding_floor6_Mesh_2',
      'hbuilding_floor6_Mesh_3', 'hbuilding_floor6_Mesh_4', 'hbuilding_floor6_Mesh_5',
    ],
  },
  {
    meshName: 'hbuilding_floor7',
    buildingId: 'hbuilding',
    position: [0.05304322, 0.07803924, 0.20925534],
    subMeshes: [
      'hbuilding_floor7_Mesh', 'hbuilding_floor7_Mesh_1', 'hbuilding_floor7_Mesh_2',
      'hbuilding_floor7_Mesh_3', 'hbuilding_floor7_Mesh_4',
    ],
  },
  {
    meshName: 'hbuilding_floor8',
    buildingId: 'hbuilding',
    position: [0.04476764, 0.09105214, 0.17216942],
    subMeshes: [
      'hbuilding_floor8_Mesh', 'hbuilding_floor8_Mesh_1', 'hbuilding_floor8_Mesh_2',
      'hbuilding_floor8_Mesh_3', 'hbuilding_floor8_Mesh_4',
    ],
  },
];

// ─── Building Configurations ───────────────────────────────────────────────────

/**
 * Metadata por edificio y encuadre de cámara en world space.
 * `focusTarget` es el punto que mira la cámara y `focusPosition` su destino al hacer
 * zoom. Ambos deben permanecer coordinados con la escala y ubicación del GLB.
 */
export const buildingConfigs: Record<BuildingId, BuildingConfig> = {
  cabin01: {
    id: 'cabin01',
    name: 'Cabaña 1',
    floors: buildingFloors.cabin01,
    focusTarget: [0.097, 0.087, 0.100],
    focusPosition: [0.25, 0.20, 0.25],
  },
  cabin02: {
    id: 'cabin02',
    name: 'Cabaña 2',
    floors: buildingFloors.cabin02,
    focusTarget: [0.173, 0.087, 0.063],
    focusPosition: [0.33, 0.20, 0.22],
  },
  cabin03: {
    id: 'cabin03',
    name: 'Cabaña 3',
    floors: buildingFloors.cabin03,
    focusTarget: [0.218, 0.087, -0.001],
    focusPosition: [0.38, 0.20, 0.15],
  },
  dbuilding: {
    id: 'dbuilding',
    name: 'Edificio D',
    floors: buildingFloors.dbuilding,
    focusTarget: [0.017, 0.091, 0.066],
    focusPosition: [0.28, 0.24, 0.32],
  },
  ebuilding: {
    id: 'ebuilding',
    name: 'Edificio E',
    floors: buildingFloors.ebuilding,
    focusTarget: [0.019, 0.117, -0.074],
    focusPosition: [0.28, 0.30, 0.18],
  },
  fbuilding: {
    id: 'fbuilding',
    name: 'Edificio F',
    floors: buildingFloors.fbuilding,
    focusTarget: [0.076, 0.110, -0.068],
    focusPosition: [0.34, 0.28, 0.18],
  },
  gbuilding: {
    id: 'gbuilding',
    name: 'Edificio G',
    floors: buildingFloors.gbuilding,
    focusTarget: [0.084, 0.111, -0.114],
    focusPosition: [0.343, 0.28, 0.103],
  },
  hbuilding: {
    id: 'hbuilding',
    name: 'Edificio H',
    floors: buildingFloors.hbuilding,
    focusTarget: [0.044, 0.045, 0.215],
    focusPosition: [0.35, 0.30, 0.50],
  },
  cti: {
    id: 'cti',
    name: 'CTI',
    floors: buildingFloors.cti,
    focusTarget: [-0.093, 0.005, 0.455],
    focusPosition: [0.099, 0.15, 0.621],
  },
  gym: {
    id: 'gym',
    name: 'Gimnasio',
    floors: buildingFloors.gym,
    focusTarget: [0.452, 0.003, 0.401],
    focusPosition: [0.65, 0.15, 0.6],
  },
};

// ─── Helper: mesh name → BuildingId ────────────────────────────────────────────

/** Resuelve el edificio dueño de un meshName sin depender de la geometría Three.js. */
export function getBuildingForMesh(meshName: string): BuildingId | null {
  for (const [buildingId, floors] of Object.entries(buildingFloors)) {
    if (floors.includes(meshName)) {
      return buildingId as BuildingId;
    }
  }
  return null;
}

/** Obtiene el orden base cero que determina la separación vertical del piso. */
export function getFloorIndex(meshName: string): number {
  const buildingId = getBuildingForMesh(meshName);
  if (!buildingId) return 0;
  return buildingFloors[buildingId].indexOf(meshName);
}

// ─── Floor Data (Mock) ─────────────────────────────────────────────────────────

/**
 * Metadata mock consumida por el modal. Nombres, descripciones y futuros POI deben
 * provenir del mapa ACTIVE de la API; no están embebidos en la geometría del GLB.
 */
export const floorData: Record<string, FloorDefinition> = {
  // Cabin 01
  'cabin01_floor1': {
    id: 'cabin01_floor1',
    buildingId: 'cabin01',
    level: 1,
    meshName: 'cabin01_floor1',
    name: 'Cabaña 1 — Planta Baja',
    description: 'Planta baja de la Cabaña 1. Espacios de trabajo colaborativo y área de descanso.',
  },
  'cabin01_floor2': {
    id: 'cabin01_floor2',
    buildingId: 'cabin01',
    level: 2,
    meshName: 'cabin01_floor2',
    name: 'Cabaña 1 — Piso 2',
    description: 'Segundo piso de la Cabaña 1. Salas de reunión y oficinas.',
  },
  'cabin01_floor3': {
    id: 'cabin01_floor3',
    buildingId: 'cabin01',
    level: 3,
    meshName: 'cabin01_floor3',
    name: 'Cabaña 1 — Piso 3',
    description: 'Tercer piso de la Cabaña 1.',
  },

  // Cabin 02
  'cabin02_floor1': {
    id: 'cabin02_floor1',
    buildingId: 'cabin02',
    level: 1,
    meshName: 'cabin02_floor1',
    name: 'Cabaña 2 — Planta Baja',
    description: 'Planta baja de la Cabaña 2. Espacios de trabajo colaborativo.',
  },
  'cabin02_floor2': {
    id: 'cabin02_floor2',
    buildingId: 'cabin02',
    level: 2,
    meshName: 'cabin02_floor2',
    name: 'Cabaña 2 — Piso 2',
    description: 'Segundo piso de la Cabaña 2. Aulas y salas de reunión.',
  },
  'cabin02_floor3': {
    id: 'cabin02_floor3',
    buildingId: 'cabin02',
    level: 3,
    meshName: 'cabin02_floor3',
    name: 'Cabaña 2 — Piso 3',
    description: 'Tercer piso de la Cabaña 2.',
  },

  // Cabin 03
  'cabin03_floor1': {
    id: 'cabin03_floor1',
    buildingId: 'cabin03',
    level: 1,
    meshName: 'cabin03_floor1',
    name: 'Cabaña 3 — Planta Baja',
    description: 'Planta baja de la Cabaña 3. Espacios de trabajo colaborativo.',
  },
  'cabin03_floor2': {
    id: 'cabin03_floor2',
    buildingId: 'cabin03',
    level: 2,
    meshName: 'cabin03_floor2',
    name: 'Cabaña 3 — Piso 2',
    description: 'Segundo piso de la Cabaña 3. Aulas y salas de reunión.',
  },
  'cabin03_floor3': {
    id: 'cabin03_floor3',
    buildingId: 'cabin03',
    level: 3,
    meshName: 'cabin03_floor3',
    name: 'Cabaña 3 — Piso 3',
    description: 'Tercer piso de la Cabaña 3.',
  },

  // D-Building
  'dbuilding_floor1': {
    id: 'dbuilding_floor1',
    buildingId: 'dbuilding',
    level: 1,
    meshName: 'dbuilding_floor1',
    name: 'Edificio D — Planta Baja',
    description: 'Planta baja del Edificio D.',
  },

  // E-Building
  'ebuilding_floor1': {
    id: 'ebuilding_floor1',
    buildingId: 'ebuilding',
    level: 1,
    meshName: 'ebuilding_floor1',
    name: 'Edificio E — Planta Baja',
    description: 'Planta baja del Edificio E. Cuenta con recepción, oficinas administrativas y acceso principal al edificio.',
  },
  'ebuilding_floor2': {
    id: 'ebuilding_floor2',
    buildingId: 'ebuilding',
    level: 2,
    meshName: 'ebuilding_floor2',
    name: 'Edificio E — Piso 2',
    description: 'Segundo piso del Edificio E. Aulas de clase y laboratorios de cómputo.',
  },
  'ebuilding_floor3': {
    id: 'ebuilding_floor3',
    buildingId: 'ebuilding',
    level: 3,
    meshName: 'ebuilding_floor3',
    name: 'Edificio E — Piso 3',
    description: 'Tercer piso del Edificio E. Aulas de clase y salas de estudio.',
  },
  'ebuilding_floor4': {
    id: 'ebuilding_floor4',
    buildingId: 'ebuilding',
    level: 4,
    meshName: 'ebuilding_floor4',
    name: 'Edificio E — Piso 4',
    description: 'Cuarto piso del Edificio E. Laboratorios especializados y talleres.',
  },
  'ebuilding_floor5': {
    id: 'ebuilding_floor5',
    buildingId: 'ebuilding',
    level: 5,
    meshName: 'ebuilding_floor5',
    name: 'Edificio E — Piso 5',
    description: 'Quinto piso del Edificio E. Oficinas de profesores y salas de reunión.',
  },

  // F-Building
  ...Object.fromEntries(
    [1, 2, 3, 4].map((level) => {
      const id = `fbuilding_floor${level}`;
      return [id, {
        id,
        buildingId: 'fbuilding' as const,
        level,
        meshName: id,
        name: `Edificio F — ${level === 1 ? 'Planta Baja' : `Piso ${level}`}`,
        description: `${level === 1 ? 'Planta baja' : `Piso ${level}`} del Edificio F.`,
      }];
    })
  ),

  // G-Building
  ...Object.fromEntries(
    [1, 2, 3, 4].map((level) => {
      const id = `gbuilding_floor${level}`;
      return [id, {
        id,
        buildingId: 'gbuilding' as const,
        level,
        meshName: id,
        name: `Edificio G — ${level === 1 ? 'Planta Baja' : `Piso ${level}`}`,
        description: `${level === 1 ? 'Planta baja' : `Piso ${level}`} del Edificio G.`,
      }];
    })
  ),

  // H-Building
  'hbuilding_floor1': {
    id: 'hbuilding_floor1',
    buildingId: 'hbuilding',
    level: 1,
    meshName: 'hbuilding_floor1',
    name: 'Edificio H — Planta Baja',
    description: 'Planta baja del Edificio H. Recepción y acceso principal.',
  },
  'hbuilding_floor2': {
    id: 'hbuilding_floor2',
    buildingId: 'hbuilding',
    level: 2,
    meshName: 'hbuilding_floor2',
    name: 'Edificio H — Piso 2',
    description: 'Segundo piso del Edificio H. Aulas y laboratorios.',
  },
  'hbuilding_floor3': {
    id: 'hbuilding_floor3',
    buildingId: 'hbuilding',
    level: 3,
    meshName: 'hbuilding_floor3',
    name: 'Edificio H — Piso 3',
    description: 'Tercer piso del Edificio H. Aulas de clase.',
  },
  'hbuilding_floor4': {
    id: 'hbuilding_floor4',
    buildingId: 'hbuilding',
    level: 4,
    meshName: 'hbuilding_floor4',
    name: 'Edificio H — Piso 4',
    description: 'Cuarto piso del Edificio H. Laboratorios especializados.',
  },
  'hbuilding_floor5': {
    id: 'hbuilding_floor5',
    buildingId: 'hbuilding',
    level: 5,
    meshName: 'hbuilding_floor5',
    name: 'Edificio H — Piso 5',
    description: 'Quinto piso del Edificio H. Salas de estudio y tutorías.',
  },
  'hbuilding_floor6': {
    id: 'hbuilding_floor6',
    buildingId: 'hbuilding',
    level: 6,
    meshName: 'hbuilding_floor6',
    name: 'Edificio H — Piso 6',
    description: 'Sexto piso del Edificio H. Oficinas administrativas.',
  },
  'hbuilding_floor7': {
    id: 'hbuilding_floor7',
    buildingId: 'hbuilding',
    level: 7,
    meshName: 'hbuilding_floor7',
    name: 'Edificio H — Piso 7',
    description: 'Séptimo piso del Edificio H. Oficinas de profesores.',
  },
  'hbuilding_floor8': {
    id: 'hbuilding_floor8',
    buildingId: 'hbuilding',
    level: 8,
    meshName: 'hbuilding_floor8',
    name: 'Edificio H — Piso 8',
    description: 'Octavo piso del Edificio H. Dirección y sala de conferencias.',
  },

  // CTI
  'cti_floor1': {
    id: 'cti_floor1',
    buildingId: 'cti',
    level: 1,
    meshName: 'cti_floor1',
    name: 'CTI — Planta Única',
    description: 'Centro de Tecnología e Información. Laboratorios de cómputo y soporte técnico.',
  },

  // Gym
  'gym_floor1': {
    id: 'gym_floor1',
    buildingId: 'gym',
    level: 1,
    meshName: 'gym_floor1',
    name: 'Gimnasio — Planta Única',
    description: 'Gimnasio del campus. Cancha multiusos, área de ejercicio y vestidores.',
  },
};
