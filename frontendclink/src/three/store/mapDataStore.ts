import { create } from 'zustand';
import {
  fetchActiveCampusMap,
  type RuntimeMapData,
} from '../api/mapApi';

interface MapDataState {
  data: RuntimeMapData | null;
  isLoading: boolean;
  error: string | null;
  loadMap: (campusId: string) => Promise<void>;
}

let pending: { campusId: string; abort: AbortController } | null = null;

export const useMapDataStore = create<MapDataState>((set, get) => ({
  data: null,
  isLoading: false,
  error: null,

  loadMap: async (campusId) => {
    if (get().data?.campusId === campusId || pending?.campusId === campusId) {
      return;
    }

    pending?.abort.abort();
    const abort = new AbortController();
    pending = { campusId, abort };
    set({
      data: null,
      isLoading: true,
      error: null,
    });

    try {
      const data = await fetchActiveCampusMap(campusId, abort.signal);
      if (abort.signal.aborted) return;

      set({
        data,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      if (abort.signal.aborted) return;
      set({
        data: null,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to load campus map',
      });
    } finally { if (pending?.abort === abort) pending = null; }
  },
}));
