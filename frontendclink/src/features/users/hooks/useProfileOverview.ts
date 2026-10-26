import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchOwnActivityCount, fetchProfileOverview, type ProfileOverview } from '../api/profilePersonalApi';

type ProfileCounts = { scope: string; overview: ProfileOverview | null; activities: number | null };
// Un solo ámbito en memoria; no persiste entre arranques de la aplicación.
let cachedCounts: ProfileCounts | null = null;

/** Solo los totales se consultan en el Perfil; el contenido se carga al abrir cada modal. */
export function useProfileOverview(campusId: string | null, userId?: string, sessionStartedAt?: string) {
  const scope = campusId ? JSON.stringify([userId, campusId, sessionStartedAt]) : null;
  const [state, setState] = useState<{
    scope: string | null; overview: ProfileOverview | null; activities: number | null; failed: boolean; loading: boolean;
  }>({ scope: null, overview: null, activities: null, failed: false, loading: false });
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!scope || !campusId) { cachedCounts = null; return; }
    if (cachedCounts?.scope !== scope) cachedCounts = { scope, overview: null, activities: null };
    const known = cachedCounts;
    const abort = new AbortController();
    setState({ ...known, failed: false, loading: true });
    const overview = fetchProfileOverview(abort.signal).then(value => {
      if (!abort.signal.aborted) {
        cachedCounts = { ...(cachedCounts?.scope === scope ? cachedCounts : known), overview: value };
        setState(previous => ({ ...previous, overview: value }));
      }
    }).catch(() => { if (!abort.signal.aborted) setState(previous => ({ ...previous, failed: true })); });
    // Las inscripciones no forman parte de la actualización periódica de la portada.
    const activities = known.activities !== null ? Promise.resolve() : fetchOwnActivityCount(campusId, abort.signal).then(value => {
      if (!abort.signal.aborted) {
        cachedCounts = { ...(cachedCounts?.scope === scope ? cachedCounts : known), activities: value };
        setState(previous => ({ ...previous, activities: value }));
      }
    }).catch(() => { if (!abort.signal.aborted) setState(previous => ({ ...previous, failed: true })); });
    void Promise.allSettled([overview, activities]).then(() => {
      if (!abort.signal.aborted) setState(previous => ({ ...previous, loading: false }));
    });
    return () => abort.abort();
  }, [campusId, scope, revision]));
  const current = scope !== null && state.scope === scope ? state
    : scope !== null && cachedCounts?.scope === scope ? { ...cachedCounts, failed: false, loading: false } : null;
  const retry = useCallback(() => setRevision(value => value + 1), []);
  return { overview: current?.overview ?? null, activities: current?.activities ?? null, failed: current?.failed ?? false,
    loading: Boolean(scope && !current?.overview && (!current || current.loading)),
    refreshing: Boolean(scope && (!current || current.loading)), retry };
}
