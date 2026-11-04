import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchNotificationActivityChange } from '../api/notificationsApi';
import type { NotificationActivityChange } from '../types/notification';

/** Lectura perezosa del aviso exacto, cancelable al cerrar o cambiar de identidad/campus. */
export function useNotificationActivityChange(notificationId: string | undefined, activityId: string, enabled: boolean) {
  const { identity, refreshIdentity } = useAuth();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const valid = enabled && !!identity?.userId && !!identity?.campusId && !!notificationId;
  const key = JSON.stringify([identity?.userId, identity?.campusId, notificationId, activityId, revision, valid]);
  const [state, setState] = useState<{ key: string; change: NotificationActivityChange | null; error: string | null }>({ key: '', change: null, error: null });
  useEffect(() => {
    if (!valid || !notificationId) return;
    const abort = new AbortController();
    void fetchNotificationActivityChange(notificationId, abort.signal).then(change => {
      if (change.activityId !== activityId) throw new Error('La actividad del aviso cambió.');
      if (!abort.signal.aborted) setState({ key, change, error: null });
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setState({ key, change: null, error: reason instanceof AuthApiError && reason.status === 404
        ? 'El cambio de esta actividad ya no está disponible.' : 'No se pudo cargar el cambio. Reintenta.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => abort.abort();
  }, [key, valid, notificationId, activityId, refreshIdentity]);
  return { change: valid && state.key === key ? state.change : null, isLoading: valid && state.key !== key,
    error: !enabled ? null : !valid ? 'El aviso no está disponible.' : state.key === key ? state.error : null, refresh };
}
