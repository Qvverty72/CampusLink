import { useCallback, useEffect, useState } from 'react';
import { fetchOwnActivities, type OwnActivitiesPage } from '../api/profilePersonalApi';

/** Se monta solo al abrir Mis actividades; cada página cancela la consulta anterior. */
export function useOwnActivities(campusId: string) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OwnActivitiesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(null); setResult(null);
    void fetchOwnActivities(campusId, page, abort.signal).then(value => {
      if (!abort.signal.aborted) setResult(value);
    }).catch(() => {
      if (!abort.signal.aborted) setError('No se pudieron cargar tus actividades. Reintenta.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [campusId, page, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { result, page, loading, error, reload, setPage };
}
