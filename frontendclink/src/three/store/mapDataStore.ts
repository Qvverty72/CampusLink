import { create } from 'zustand';
import {
  fetchActiveCampusMap,
  ApiClientError,
  type RuntimeMapData,
} from '../api/mapApi';

/** Estado remoto del mapa activo y operaciones para cargarlo o descartarlo. */
interface MapDataState {
  data: RuntimeMapData | null;
  isLoading: boolean;
  error: string | null;
  loadMap: (campusId: string, accessToken: string) => Promise<void>;
  clearMap: () => void;
}

// Solo se mantiene una carga en curso: un campus nuevo cancela la petición previa.
let pending: { campusId: string; abort: AbortController } | null = null;

export const useMapDataStore = create<MapDataState>((set, get) => ({
  data: null,
  isLoading: false,
  error: null,

  /** Cancela la carga vigente y elimina datos de campus anteriores de la UI. */
  clearMap: () => {
    pending?.abort.abort();
    pending = null;
    set({ data: null, isLoading: false, error: null });
  },

  /**
   * Carga el mapa del campus y descarta respuestas obsoletas.
   * Propaga errores de autenticación/autorización; otros fallos quedan en `error`.
   */
  loadMap: async (campusId, accessToken) => {
    if (!accessToken?.trim()) {
      get().clearMap();
      throw new ApiClientError(401, 'UNAUTHENTICATED', 'Inicia sesión para consultar el mapa.');
    }
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
      const data = await fetchActiveCampusMap(campusId, accessToken, abort.signal);
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
      if (error instanceof ApiClientError && [401, 403].includes(error.status)) throw error;
    } finally { if (pending?.abort === abort) pending = null; }
  },
}));
