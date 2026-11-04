import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { recordViewedActivity } from '../api/activitiesApi';
import { activityOperationId } from '../types/interaction';
import type { ActivityDetail } from '../types/activity';

/** Una vista por apertura cargada; conserva la clave al refrescar o reintentar. */
export function useActivityView(activityId: string, detail: ActivityDetail | null, isLoading: boolean, error: string | null) {
  const { identity, refreshIdentity } = useAuth();
  const view = useRef<{ key: string; id: string; confirmed: boolean } | null>(null);
  useEffect(() => {
    if (!identity || !detail || isLoading || error || detail.campusId !== identity.campusId) return;
    const key = JSON.stringify([identity.profile.id, identity.campusId, activityId]);
    if (view.current?.key !== key) view.current = { key, id: activityOperationId(), confirmed: false };
    if (view.current.confirmed) return;
    const intent = view.current; const abort = new AbortController();
    void recordViewedActivity(identity.campusId, activityId, intent.id, abort.signal).then(() => {
      if (!abort.signal.aborted && view.current === intent) intent.confirmed = true;
    }).catch(reason => {
      if (!abort.signal.aborted && reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => abort.abort();
  }, [identity?.profile.id, identity?.campusId, activityId, detail?.id, detail?.campusId, isLoading, error, refreshIdentity]);
}
