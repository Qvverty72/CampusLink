import { create } from 'zustand';

/** Comparte el último conteo confirmado entre Perfil y su ruta modal. */
export const useNotificationUnreadStore = create<{
  scope: string | null;
  count: number | null;
  setCount: (scope: string, count: number) => void;
}>((set) => ({ scope: null, count: null, setCount: (scope, count) => set({ scope, count }) }));
