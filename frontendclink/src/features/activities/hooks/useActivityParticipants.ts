import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchActivityParticipants } from '../api/activitiesApi';
import type { ActivityParticipantsPage } from '../types/activity';

export function useActivityParticipants(activityId: string, refreshKey: string) {
  const { identity, session, refreshIdentity } = useAuth();
  const campusId = identity?.campusId;
  const token = session?.access_token;
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([campusId, token, activityId, page, revision, refreshKey]);
  const [state, setState] = useState<{ key: string; data: ActivityParticipantsPage | null; error: string | null }>({ key: '', data: null, error: null });
  useEffect(() => {
    if (!campusId || !token) return;
    const abort = new AbortController();
    void fetchActivityParticipants(campusId, activityId, page, abort.signal).then(data => {
      if (!abort.signal.aborted) setState({ key, data, error: null });
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setState({ key, data: null, error: 'No se pudo cargar la lista de inscritos.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => abort.abort();
  }, [key, campusId, token, activityId, page, refreshIdentity]);
  const data = state.key === key ? state.data : null;
  return { data, isLoading: !!campusId && !!token && state.key !== key,
    error: state.key === key ? state.error : null,
    refresh: () => setRevision(value => value + 1),
    previous: () => setPage(Math.max(1, (data?.page ?? page) - 1)),
    next: () => { if (data && data.page * data.pageSize < data.total) setPage(data.page + 1); } };
}
