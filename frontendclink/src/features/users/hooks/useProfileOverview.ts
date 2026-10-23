import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchOwnActivityCount, fetchProfileOverview, type ProfileOverview } from '../api/profilePersonalApi';

/** Solo los totales se consultan en el Perfil; el contenido se carga al abrir cada modal. */
export function useProfileOverview(campusId: string | null, userId?: string) {
  const scope = campusId ? JSON.stringify([userId, campusId]) : null;
  const [state, setState] = useState<{
    scope: string | null; overview: ProfileOverview | null; activities: number | null; failed: boolean; loading: boolean;
  }>({ scope: null, overview: null, activities: null, failed: false, loading: false });
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!scope || !campusId) return;
    const abort = new AbortController();
    setState(previous => ({ scope, overview: previous.scope === scope ? previous.overview : null,
      activities: previous.scope === scope ? previous.activities : null, failed: false, loading: true }));
    const overview = fetchProfileOverview(abort.signal).then(value => {
      if (!abort.signal.aborted) setState(previous => ({ ...previous, overview: value }));
    }).catch(() => { if (!abort.signal.aborted) setState(previous => ({ ...previous, failed: true })); });
    const activities = fetchOwnActivityCount(campusId, abort.signal).then(value => {
      if (!abort.signal.aborted) setState(previous => ({ ...previous, activities: value }));
    }).catch(() => { if (!abort.signal.aborted) setState(previous => ({ ...previous, failed: true })); });
    void Promise.allSettled([overview, activities]).then(() => {
      if (!abort.signal.aborted) setState(previous => ({ ...previous, loading: false }));
    });
    return () => abort.abort();
  }, [campusId, scope, revision]));
  const current = scope !== null && state.scope === scope ? state : null;
  const retry = useCallback(() => setRevision(value => value + 1), []);
  return { overview: current?.overview ?? null, activities: current?.activities ?? null, failed: current?.failed ?? false,
    loading: Boolean(scope && (!current || current.loading)), retry };
}
