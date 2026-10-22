import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadDashboard, loadDashboardOptions } from '../api/dashboardApi';
import { canAccessAnalytics } from '../types/access';
import type { DashboardData, DashboardFilters, DashboardGrouping, DashboardOptions } from '../types/dashboard';

/** Cada resultado pertenece a una identidad y selección; el cleanup descarta respuestas tardías. */
export function useAnalyticsDashboard(initialRange: { from: string; to: string }) {
  const auth = useAuth(), identity = auth.identity;
  const [range, setRange] = useState({ ...initialRange, grouping: 'month' as DashboardGrouping });
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<{ key: string; filters: DashboardFilters } | null>(null);
  const [catalog, setCatalog] = useState<{ key: string; data: DashboardOptions | null; error: string }>({ key: '', data: null, error: '' });
  const [result, setResult] = useState<{ key: string; loading: boolean; data: DashboardData | null; error: string }>({ key: '', loading: false, data: null, error: '' });
  const allowed = canAccessAnalytics(identity);
  const identityKey = JSON.stringify([identity?.userId, identity?.campusId, identity?.profile.institucion_id,
    identity?.roles, identity?.permissions, allowed]);
  const optionsKey = JSON.stringify([identityKey, revision]);
  const options = allowed && catalog.key === optionsKey ? catalog.data : null;
  const institution = options?.institutions[0];
  const filters = selection?.key === identityKey ? selection.filters : institution ? {
    institutionId: institution.id,
    campusIds: [institution.campuses.find(c => c.id === identity?.campusId)?.id ?? institution.campuses[0].id],
  } : null;
  const key = JSON.stringify([optionsKey, filters, range]);

  const failed = (reason: unknown) => {
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    return reason instanceof AuthApiError && reason.serverMessage ? reason.serverMessage : 'No se pudo cargar el tablero. Inténtalo nuevamente.';
  };
  useEffect(() => {
    const controller = new AbortController();
    setCatalog({ key: optionsKey, data: null, error: '' });
    setResult({ key: '', loading: false, data: null, error: '' });
    if (!identity || !allowed) return () => controller.abort();
    void loadDashboardOptions(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalog({ key: optionsKey, data, error: '' });
    }).catch(reason => {
      if (!controller.signal.aborted) setCatalog({ key: optionsKey, data: null, error: failed(reason) });
    });
    return () => controller.abort();
  }, [optionsKey]);

  useEffect(() => {
    const controller = new AbortController();
    if (!identity || !allowed || !options || !filters || !filters.campusIds.length) return () => controller.abort();
    setResult({ key, loading: true, data: null, error: '' });
    void loadDashboard(range.from, range.to, identity.campusId, controller.signal, filters, range.grouping).then(data => {
      if (!controller.signal.aborted) setResult({ key, loading: false, data, error: '' });
    }).catch(reason => {
      if (!controller.signal.aborted) setResult({ key, loading: false, data: null, error: failed(reason) });
    });
    return () => controller.abort();
  }, [key, Boolean(options)]);

  const current = allowed && Boolean(options) && result.key === key;
  const optionsError = allowed && catalog.key === optionsKey ? catalog.error : '';
  return { options, filters, dashboard: current ? result.data : null,
    loading: allowed && !optionsError && (!options || (Boolean(filters?.campusIds.length) && (!current || result.loading))),
    error: optionsError || (current ? result.error : ''),
    selectFilters(next: DashboardFilters) { setSelection({ key: identityKey, filters: next }); },
    consult(from: string, to: string, grouping: DashboardGrouping = range.grouping) { setRange({ from, to, grouping }); setRevision(value => value + 1); } };
}
