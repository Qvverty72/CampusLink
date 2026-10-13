import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchLocationActivities } from '../api/activitiesApi';
import type { Activity, ActivityLocationQuery } from '../types/activity';
import { selectActivityOccurrences } from '../types/activity';

export interface ActivitiesState {
  activities: Activity[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useLocationActivities(query: ActivityLocationQuery = {}, enabled = true): ActivitiesState {
  const { identity, session, refreshIdentity } = useAuth();
  const campusId = identity?.campusId;
  const token = session?.access_token;
  const { buildingKey, floorKey, poiKey } = query;
  const key = JSON.stringify([campusId, token, buildingKey, floorKey, poiKey, enabled]);
  const [revision, setRevision] = useState({ value: 0, background: false });
  const refresh = useCallback(() => setRevision(previous => ({ value: previous.value + 1, background: false })), []);
  const [clock, setClock] = useState(Date.now);
  const [state, setState] = useState<{ key: string; activities: Activity[]; isLoading: boolean; error: string | null }>({
    key: '', activities: [], isLoading: false, error: null,
  });

  useEffect(() => {
    if (!enabled || !campusId || !token) return;
    const abort = new AbortController();
    setState(previous => revision.background && previous.key === key && !previous.isLoading && !previous.error
      ? { ...previous, error: null } : { key, activities: [], isLoading: true, error: null });
    void fetchLocationActivities(campusId, { buildingKey, floorKey, poiKey }, abort.signal).then(activities => {
      if (abort.signal.aborted) return;
      // Keep all authorized occurrences so the next card can appear even while revalidation is pending.
      setState({ key, activities, isLoading: false, error: null });
      setClock(Date.now());
    }).catch(reason => {
      if (abort.signal.aborted) return;
      const unauthorized = reason instanceof AuthApiError && [401, 403].includes(reason.status);
      setState(previous => revision.background && previous.key === key && !previous.isLoading && !previous.error && !unauthorized
        ? previous : { key, activities: [], isLoading: false, error: 'No se pudieron cargar las actividades. Reintenta.' });
      if (unauthorized) refreshIdentity();
    });
    return () => abort.abort();
  }, [key, enabled, campusId, token, buildingKey, floorKey, poiKey, revision, refresh, refreshIdentity]);

  useEffect(() => {
    if (!enabled || !campusId || !token || state.key !== key || state.isLoading) return;
    const visible = selectActivityOccurrences(state.activities);
    const end = Math.min(...visible.map(activity => Date.parse(activity.endAt)));
    if (!Number.isFinite(end)) return;
    const expiry = setTimeout(() => {
      const now = Date.now();
      setClock(now);
      // Long waits are capped by the JS timer limit; only refetch once an activity actually ends.
      if (now >= end) setRevision(previous => ({ value: previous.value + 1, background: true }));
    }, Math.min(2_147_483_647, Math.max(1, end - Date.now())));
    return () => clearTimeout(expiry);
  }, [key, enabled, campusId, token, state, clock]);

  useEffect(() => {
    if (!enabled || !campusId || !token) return;
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') return;
      setClock(Date.now());
      setRevision(previous => ({ value: previous.value + 1, background: true }));
    });
    return () => subscription.remove();
  }, [key, enabled, campusId, token]);

  // A changed campus/session/location cannot display the previous request while the effect starts.
  return state.key === key && enabled && campusId && token
    ? { activities: selectActivityOccurrences(state.activities), isLoading: state.isLoading, error: state.error, refresh }
    : { activities: [], isLoading: Boolean(enabled && campusId && token), error: null, refresh };
}
