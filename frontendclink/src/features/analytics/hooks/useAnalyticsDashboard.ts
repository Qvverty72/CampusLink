import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadDashboard } from '../api/dashboardApi';
import type { DashboardData } from '../types/dashboard';

/** Retira datos de otra identidad/consulta y descarta respuestas tardías al cambiar de contexto. */
export function useAnalyticsDashboard(initialRange: { from: string; to: string }) {
  const auth = useAuth(), identity = auth.identity;
  const [range, setRange] = useState(initialRange);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; loading: boolean; data: DashboardData | null; error: string }>({
    key: '', loading: false, data: null, error: '',
  });
  const allowed = Boolean(identity?.capabilities.reports);
  const key = JSON.stringify([identity?.userId, identity?.campusId, identity?.profile.institucion_id,
    identity?.roles, identity?.permissions, allowed, range, revision]);

  useEffect(() => {
    const controller = new AbortController();
    if (!identity || !allowed) return () => controller.abort();
    setResult({ key, loading: true, data: null, error: '' });
    void loadDashboard(range.from, range.to, identity.campusId, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, loading: false, data, error: '' });
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setResult({ key, loading: false, data: null, error: reason instanceof AuthApiError && reason.serverMessage
        ? reason.serverMessage : 'No se pudo cargar el tablero. Inténtalo nuevamente.' });
      if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    });
    return () => controller.abort();
  }, [key]);

  const current = allowed && result.key === key;
  return { dashboard: current ? result.data : null, loading: allowed && (!current || result.loading),
    error: current ? result.error : '', consult(from: string, to: string) {
      setRange({ from, to }); setRevision(value => value + 1);
    } };
}
