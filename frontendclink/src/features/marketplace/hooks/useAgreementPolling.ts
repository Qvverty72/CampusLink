import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export const AGREEMENT_POLL_INTERVAL = 20_000;

/** Solo lectura y solo en espera; el consumidor decide si hay un formulario o mutación activa. */
export function useAgreementPolling(onRefresh: () => void, enabled: boolean) {
  const latest = useRef(onRefresh); latest.current = onRefresh;
  useEffect(() => {
    if (!enabled) return;
    let visibility = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => { visibility = next; });
    const timer = setInterval(() => { if (visibility === 'active') latest.current(); }, AGREEMENT_POLL_INTERVAL);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [enabled]);
}
