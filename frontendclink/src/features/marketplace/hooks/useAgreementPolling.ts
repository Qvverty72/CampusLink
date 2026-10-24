import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export const AGREEMENT_POLL_INTERVAL = 20_000;
export const COORDINATION_MESSAGES_POLL_INTERVAL = 7_000;

/** Solo lectura y solo en espera; el consumidor decide si hay un formulario o mutación activa. */
export function useAgreementPolling(onRefresh: () => void, enabled: boolean, interval = AGREEMENT_POLL_INTERVAL, onPause?: () => void) {
  const latest = useRef(onRefresh); latest.current = onRefresh;
  const pause = useRef(onPause); pause.current = onPause;
  useEffect(() => {
    if (!enabled) return;
    let visibility = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => { visibility = next; if (next !== 'active') pause.current?.(); });
    const timer = setInterval(() => { if (visibility === 'active') latest.current(); }, interval);
    return () => { clearInterval(timer); subscription.remove(); pause.current?.(); };
  }, [enabled, interval]);
}
