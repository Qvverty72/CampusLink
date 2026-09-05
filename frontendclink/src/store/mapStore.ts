/**
 * CampusLink MVP — Map State (Zustand)
 *
 * Controls the interaction flow:
 * CAMPUS_VIEW → BUILDING_EXPLODED → FLOOR_MODAL → BUILDING_EXPLODED → CAMPUS_VIEW
 */

import { create } from 'zustand';
import type { BuildingId, MapState } from '@/types/map';

export const useMapStore = create<MapState>((set) => ({
  // ─── Initial State ─────────────────────────────────────────────────────────
  selectedBuilding: null,
  selectedFloor: null,
  isExploded: false,
  isFloorModalOpen: false,

  // ─── Actions ───────────────────────────────────────────────────────────────

  /**
   * Select a building → zoom + explode
   * Resets any previously selected floor/modal.
   */
  selectBuilding: (buildingId: BuildingId) =>
    set({
      selectedBuilding: buildingId,
      isExploded: true,
      selectedFloor: null,
      isFloorModalOpen: false,
    }),

  /**
   * Select a floor → show modal
   * Only valid when a building is already exploded.
   */
  selectFloor: (floorId: string) =>
    set({
      selectedFloor: floorId,
      isFloorModalOpen: true,
    }),

  /**
   * Close the floor modal.
   * Building stays exploded so user can select another floor.
   */
  closeFloorModal: () =>
    set({
      isFloorModalOpen: false,
      selectedFloor: null,
    }),

  /**
   * Reset to campus view.
   * Triggered when camera zooms out past the exit threshold.
   */
  resetBuilding: () =>
    set({
      selectedBuilding: null,
      selectedFloor: null,
      isExploded: false,
      isFloorModalOpen: false,
    }),
}));
