/**
 * Estado de interacción del mapa compartido por componentes 3D y React Native.
 *
 * Zustand evita prop drilling entre Canvas, cámara, modal y controles flotantes.
 * El flujo esperado es:
 * CAMPUS_VIEW → BUILDING_EXPLODED → FLOOR_MODAL → BUILDING_EXPLODED → CAMPUS_VIEW.
 */

import { create } from 'zustand';
import type { BuildingId, MapState } from '@/three/types/map';

// Cada consumidor usa un selector pequeño para rerenderizarse solo cuando cambia
// la porción de estado que necesita; la animación por frame permanece en refs.
export const useMapStore = create<MapState>((set) => ({
  // ─── Initial State ─────────────────────────────────────────────────────────
  selectedBuilding: null,
  selectedFloor: null,
  isExploded: false,
  isFloorModalOpen: false,

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Selecciona un edificio y deja el estado listo para zoom + exploded view. */
  selectBuilding: (buildingId: BuildingId) =>
    set({
      selectedBuilding: buildingId,
      isExploded: true,
      selectedFloor: null,
      isFloorModalOpen: false,
    }),

  /** Guarda el piso elegido y abre su overlay informativo. */
  selectFloor: (floorId: string) =>
    set({
      selectedFloor: floorId,
      isFloorModalOpen: true,
    }),

  /** Cierra el modal sin colapsar el edificio, permitiendo elegir otro piso. */
  closeFloorModal: () =>
    set({
      isFloorModalOpen: false,
      selectedFloor: null,
    }),

  /** Restablece en conjunto toda la selección para volver a la vista del campus. */
  resetBuilding: () =>
    set({
      selectedBuilding: null,
      selectedFloor: null,
      isExploded: false,
      isFloorModalOpen: false,
    }),
}));
