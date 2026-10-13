import { useEffect, useRef, useState } from 'react';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadReviewCampuses, loadReviewReports, loadReviewReport } from '../api/reviewApi';
import type { ReviewDetail, ReviewFilters, ReviewSummary } from '../types/review';

/** Mounted inside an identity/session keyed screen; no evidence survives an actor change. */
export function useReportReview() {
  const auth = useAuth();
  const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [campusId, setCampusId] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ReviewFilters>({});
  const [entries, setEntries] = useState<ReviewSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campusRevision, setCampusRevision] = useState(0);
  const [listRevision, setListRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  function clear() { pending.current?.abort(); setSelected(null); setEntries([]); setHasMore(false); setError(''); }
  function fail(reason: unknown) {
    setError(reason instanceof AuthApiError && reason.status === 403 ? 'Ya no tienes acceso de moderación a este campus.'
      : reason instanceof AuthApiError && reason.status === 401 ? 'Tu sesión venció. Inicia sesión nuevamente.'
      : reason instanceof AuthApiError && reason.status === 404 ? 'La denuncia no está disponible en este campus.'
      : 'No se pudieron consultar las denuncias. Inténtalo nuevamente.');
    if (reason instanceof AuthApiError && [401,403].includes(reason.status)) {
      setSelected(null); setEntries([]); setHasMore(false); auth.refreshIdentity();
    }
  }
  useEffect(() => {
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setLoading(true); setError('');
    void loadReviewCampuses(controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setCampuses(rows); setCampusId(rows[0]?.id ?? '');
    }).catch(reason => { if (!controller.signal.aborted) fail(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [campusRevision]);
  useEffect(() => {
    if (!campusId) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setSelected(null); setEntries([]); setHasMore(false); setLoading(true); setError('');
    void loadReviewReports(campusId, page, filters, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setEntries(result.data); setHasMore(result.meta.hasMore);
    }).catch(reason => { if (!controller.signal.aborted) fail(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [campusId, page, filters, listRevision]);
  useEffect(() => () => pending.current?.abort(), []);
  async function select(id: string) {
    if (loading) return;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setSelected(null); setError(''); setLoading(true);
    try {
      const result = await loadReviewReport(campusId, id, controller.signal);
      if (!controller.signal.aborted) setSelected(result);
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return { campuses, campusId, page, filters, entries, selected, hasMore, loading, error, select,
    close: () => setSelected(null),
    changeCampus: (id: string) => { if (id !== campusId) { clear(); setLoading(true); setPage(1); setCampusId(id); } },
    changeFilters: (next: ReviewFilters) => { clear(); setLoading(true); setPage(1); setFilters(next); },
    changePage: (next: number) => { clear(); setLoading(true); setPage(next); },
    reload: () => { clear(); setLoading(true); if (campusId) setListRevision(value => value + 1); else setCampusRevision(value => value + 1); },
  };
}
