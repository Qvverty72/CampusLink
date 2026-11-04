import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchUnreadNotificationCount } from '../api/notificationsApi';
import { useNotificationUnreadStore } from '../store/notificationUnreadStore';

/** Refresca solo en foco/foreground y nunca expone el contador de otra cuenta o campus. */
export function useUnreadNotificationCount() {
  const { identity, refreshIdentity } = useAuth();
  const scope = identity?.capabilities.general ? JSON.stringify([identity.userId, identity.campusId]) : null;
  const unreadCount = useNotificationUnreadStore(state => state.scope === scope && scope !== null ? state.count : null);
  const [requestState, setRequestState] = useState<{ scope: string | null; loading: boolean }>({ scope: null, loading: false });
  const refreshRef = useRef<() => void>(() => {});
  const refreshUnreadCount = useCallback(() => refreshRef.current(), []);

  useFocusEffect(useCallback(() => {
    if (!scope) return;
    let active = true;
    let pending: AbortController | null = null;
    const refresh = () => {
      if (!active || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      pending?.abort();
      const abort = new AbortController(); pending = abort;
      setRequestState({ scope, loading: true });
      void fetchUnreadNotificationCount(abort.signal).then(count => {
        if (active && !abort.signal.aborted) useNotificationUnreadStore.getState().setCount(scope, count);
      }).catch(reason => {
        if (active && !abort.signal.aborted && reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
      }).finally(() => {
        if (pending === abort) {
          pending = null;
          if (active && !abort.signal.aborted) setRequestState({ scope, loading: false });
        }
      });
    };
    refreshRef.current = refresh;
    refresh();
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') refresh();
      else { pending?.abort(); setRequestState({ scope, loading: false }); }
    });
    return () => {
      active = false; pending?.abort(); clearInterval(timer); subscription.remove();
      setRequestState({ scope, loading: false });
      if (refreshRef.current === refresh) refreshRef.current = () => {};
    };
  }, [scope, refreshIdentity]));

  return { unreadCount, refreshUnreadCount, loading: Boolean(scope && (requestState.scope !== scope || requestState.loading)) };
}
