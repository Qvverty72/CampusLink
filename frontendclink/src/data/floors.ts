/**
 * CampusLink MVP — Floor & Building Data
 *
 * Centralized configuration and mock data.
 * All positions are extracted directly from the gltfjsx output.
 *
 * UPDATED: Cabins split into cabin01, cabin02, cabin03.
 * UPDATED: Each floor is now a group of sub-meshes (FloorMeshConfig).
 */

import type { BuildingId, BuildingConfig, FloorDefinition, FloorMeshConfig } from '@/types/map';

// ─── Building → Floor Names ───────────────────────────────────────────────────

/** Maps each building to its ordered list of floor group names */
export const buildingFloors: Record<BuildingId, string[]> = {
  cabin01: ['cabin01_floor1', 'cabin01_floor2'],
  cabin02: ['cabin02_floor1', 'cabin02_floor2'],
  cabin03: ['cabin03_floor1', 'cabin03_floor2'],
  ebuilding: [
    'ebuilding_floor1',
    'ebuilding_floor2',
    'ebuilding_floor3',
    'ebuilding_floor4',
    'ebuilding_floor5',
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
 * Each floor is a group of sub-meshes. This config maps each floor to:
 * - Its position from the GLB (extracted from gltfjsx output)
 * - The node names of all sub-meshes that compose it
 *
 * To update: run gltfjsx on the new GLB and copy positions + node names.
 */
export const floorMeshConfigs: FloorMeshConfig[] = [
  // ── Cabin 01 ──────────────────────────────────────────────────────────────
  {
    meshName: 'cabin01_floor1',
    buildingId: 'cabin01',
    position: [0.09683656, 0.07815167, 0.09987102],
    subMeshes: [
      'cabin01_floor1_Mesh', 'cabin01_floor1_Mesh_1', 'cabin01_floor1_Mesh_2',
      'cabin01_floor1_Mesh_3', 'cabin01_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'cabin01_floor2',
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
    position: [0.17350294, 0.0781678, 0.06341653],
    subMeshes: [
      'cabin02_floor1_Mesh', 'cabin02_floor1_Mesh_1', 'cabin02_floor1_Mesh_2',
      'cabin02_floor1_Mesh_3', 'cabin02_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'cabin02_floor2',
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
    position: [0.2185794, 0.0781755, -0.00165834],
    subMeshes: [
      'cabin03_floor1_Mesh', 'cabin03_floor1_Mesh_1', 'cabin03_floor1_Mesh_2',
      'cabin03_floor1_Mesh_3', 'cabin03_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'cabin03_floor2',
    buildingId: 'cabin03',
    position: [0.21828733, 0.09617037, -0.0019014],
    subMeshes: [
      'cabin03_floor2_Mesh', 'cabin03_floor2_Mesh_1', 'cabin03_floor2_Mesh_2',
      'cabin03_floor2_Mesh_3', 'cabin03_floor2_Mesh_4', 'cabin03_floor2_Mesh_5',
    ],
  },

  // ── CTI ────────────────────────────────────────────────────────────────────
  {
    meshName: 'cti_floor1',
    buildingId: 'cti',
    position: [-0.09179663, 0.00503575, 0.43425724],
    subMeshes: [
      'cti_floor1_Mesh001', 'cti_floor1_Mesh001_1', 'cti_floor1_Mesh001_2',
      'cti_floor1_Mesh001_3', 'cti_floor1_Mesh001_4', 'cti_floor1_Mesh001_5',
      'cti_floor1_Mesh001_6', 'cti_floor1_Mesh001_7',
    ],
  },

  // ── E-Building ─────────────────────────────────────────────────────────────
  {
    meshName: 'ebuilding_floor1',
    buildingId: 'ebuilding',
    position: [0.03902718, 0.09093073, -0.04612058],
    subMeshes: [
      'ebuilding_floor1_Mesh', 'ebuilding_floor1_Mesh_1', 'ebuilding_floor1_Mesh_2',
      'ebuilding_floor1_Mesh_3', 'ebuilding_floor1_Mesh_4',
    ],
  },
  {
    meshName: 'ebuilding_floor2',
    buildingId: 'ebuilding',
    position: [0.04565526, 0.10396966, -0.07957213],
    subMeshes: [
      'ebuilding_floor2_Mesh', 'ebuilding_floor2_Mesh_1', 'ebuilding_floor2_Mesh_2',
      'ebuilding_floor2_Mesh_3', 'ebuilding_floor2_Mesh_4',
    ],
  },
  {
    meshName: 'ebuilding_floor3',
    buildingId: 'ebuilding',
    position: [0.04565524, 0.11696966, -0.07957213],
    subMeshes: [
      'ebuilding_floor3_Mesh', 'ebuilding_floor3_Mesh_1', 'ebuilding_floor3_Mesh_2',
      'ebuilding_floor3_Mesh_3', 'ebuilding_floor3_Mesh_4',
    ],
  },
  {
    meshName: 'ebuilding_floor4',
    buildingId: 'ebuilding',
    position: [0.04565525, 0.12996966, -0.07957214],
    subMeshes: [
      'ebuilding_floor4_Mesh', 'ebuilding_floor4_Mesh_1', 'ebuilding_floor4_Mesh_2',
      'ebuilding_floor4_Mesh_3', 'ebuilding_floor4_Mesh_4',
    ],
  },
  {
    meshName: 'ebuilding_floor5',
    buildingId: 'ebuilding',
    position: [0.02078407, 0.14320296, -0.07352281],
    subMeshes: [
      'ebuilding_floor5_Mesh', 'ebuilding_floor5_Mesh_1', 'ebuilding_floor5_Mesh_2',
      'ebuilding_floor5_Mesh_3', 'ebuilding_floor5_Mesh_4',
    ],
  },

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
 * Configuration per building with camera positions for zoom.
 * focusTarget = center of the building in world coords
 * focusPosition = where the camera moves to when zooming in
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
  ebuilding: {
    id: 'ebuilding',
    name: 'Edificio E',
    floors: buildingFloors.ebuilding,
    focusTarget: [0.040, 0.115, -0.065],
    focusPosition: [0.35, 0.30, 0.25],
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
    focusTarget: [-0.092, 0.005, 0.434],
    focusPosition: [0.1, 0.15, 0.6],
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

/** Reverse lookup from floor group name to BuildingId */
export function getBuildingForMesh(meshName: string): BuildingId | null {
  for (const [buildingId, floors] of Object.entries(buildingFloors)) {
    if (floors.includes(meshName)) {
      return buildingId as BuildingId;
    }
  }
  return null;
}

/** Get the floor index (0-based) within its building */
export function getFloorIndex(meshName: string): number {
  const buildingId = getBuildingForMesh(meshName);
  if (!buildingId) return 0;
  return buildingFloors[buildingId].indexOf(meshName);
}

// ─── Floor Data (Mock) ─────────────────────────────────────────────────────────

/** Mock data for all floors */
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
