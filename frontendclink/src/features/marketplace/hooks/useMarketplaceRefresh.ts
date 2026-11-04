import { useCallback, useRef } from 'react';
import { useScrollRefresh } from '@/components/RefreshScrollView';

/** Mantiene estable el registro aunque el hook de dominio exponga callbacks por render. */
export function useMarketplaceRefresh(onRefresh: () => void, refreshing: boolean, enabled: boolean, label: string, active = true) {
  const latest = useRef(onRefresh); latest.current = onRefresh;
  const refresh = useCallback(() => latest.current(), []);
  useScrollRefresh(refresh, refreshing, enabled, label, active);
}
