import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { fetchLocationActivities } from '../api/activitiesApi';
import type { Activity, ActivityLocationQuery } from '../types/activity';
import { filterLocationActivities } from '../types/activity';

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
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const [state, setState] = useState<{ key: string; activities: Activity[]; isLoading: boolean; error: string | null }>({
    key: '', activities: [], isLoading: false, error: null,
  });

  useEffect(() => {
    if (!enabled || !campusId || !token) return;
    const abort = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    setState({ key, activities: [], isLoading: true, error: null });
    void fetchLocationActivities(campusId, { buildingKey, floorKey, poiKey }, abort.signal).then(activities => {
      if (abort.signal.aborted) return;
      const visible = filterLocationActivities(activities, {});
      setState({ key, activities: visible, isLoading: false, error: null });
      const earliestEnd = Math.min(...visible.map(activity => Date.parse(activity.endAt)));
      if (Number.isFinite(earliestEnd)) expiry = setTimeout(refresh, Math.min(2_147_483_647, Math.max(1, earliestEnd - Date.now() + 1)));
    }).catch(reason => {
      if (abort.signal.aborted) return;
      setState({ key, activities: [], isLoading: false, error: 'No se pudieron cargar las actividades. Reintenta.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) refreshIdentity();
    });
    return () => { abort.abort(); if (expiry) clearTimeout(expiry); };
  }, [key, enabled, campusId, token, buildingKey, floorKey, poiKey, revision, refresh, refreshIdentity]);

  // A changed campus/session/location cannot display the previous request while the effect starts.
  return state.key === key && enabled && campusId && token
    ? { activities: state.activities, isLoading: state.isLoading, error: state.error, refresh }
    : { activities: [], isLoading: Boolean(enabled && campusId && token), error: null, refresh };
}
