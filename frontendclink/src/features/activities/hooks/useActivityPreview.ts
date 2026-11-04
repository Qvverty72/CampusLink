import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivityDetail } from '../api/activitiesApi';
import type { ActivityDetail } from '../types/activity';

/** Lectura de un aviso/enlace: sin participación, mutaciones ni registro de vistas. */
export function useActivityPreview(activityId: string, enabled = true) {
  const { identity, refreshIdentity } = useAuth();
  const campusId = identity?.campusId, userId = identity?.userId;
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const valid = enabled && !!campusId && !!userId && /^[0-9a-f]{24}$/i.test(activityId);
  const key = JSON.stringify([campusId, userId, activityId, revision, valid]);
  const [state, setState] = useState<{ key: string; detail: ActivityDetail | null; error: string | null }>({ key: '', detail: null, error: null });
  useEffect(() => {
    if (!valid || !campusId) return;
    const abort = new AbortController();
    void fetchActivityDetail(campusId, activityId, abort.signal).then(detail => {
      if (!abort.signal.aborted) setState({ key, detail, error: null });
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setState({ key, detail: null, error: reason instanceof AuthApiError && reason.status === 404
        ? 'Esta actividad ya no está disponible.' : 'No se pudo cargar la actividad. Reintenta.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => abort.abort();
  }, [key, valid, campusId, activityId, refreshIdentity]);
  return { detail: valid && state.key === key ? state.detail : null, isLoading: valid && state.key !== key,
    error: !enabled ? null : !valid ? 'El enlace de la actividad no está disponible.' : state.key === key ? state.error : null, refresh };
}
