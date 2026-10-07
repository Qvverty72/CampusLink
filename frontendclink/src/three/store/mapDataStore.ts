import { create } from 'zustand';
import {
  fetchActiveCampusMap,
  type RuntimeMapData,
} from '@/three/api/mapApi';

interface MapDataState {
  data: RuntimeMapData | null;
  isLoading: boolean;
  error: string | null;
  loadMap: () => Promise<void>;
}

export const useMapDataStore = create<MapDataState>((set, get) => ({
  data: null,
  isLoading: false,
  error: null,

  loadMap: async () => {
    if (get().data || get().isLoading) {
      return;
    }

    set({
      isLoading: true,
      error: null,
    });

    try {
      const data = await fetchActiveCampusMap();

      set({
        data,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        data: null,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load campus map',
      });
    }
  },
}));