import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadDashboardOptions, loadHistoricalReport, loadHistoricalReports } from '../api/dashboardApi';
import { canAccessAnalytics } from '../types/access';
import type { AnalyticalReport, DashboardOptions, HistoricalReportsFilters, HistoricalReportsPage } from '../types/dashboard';

/** Cada apertura vuelve a la API, incluso al comparar: nunca restaura cifras de una sesión anterior. */
export function useHistoricalReports() {
  const auth = useAuth(), identity = auth.identity;
  const allowed = canAccessAnalytics(identity);
  const identityKey = JSON.stringify([identity?.userId, identity?.campusId, identity?.profile.institucion_id,
    identity?.roles, identity?.permissions, allowed]);
  const [query, setQuery] = useState<{ identity: string; filters: HistoricalReportsFilters; cursor: string | null; revision: number } | null>(null);
  const [selection, setSelection] = useState<{ key: string; ids: string[]; revision: number } | null>(null);
  const [catalog, setCatalog] = useState<{ key: string; data: DashboardOptions } | null>(null);
  const [listing, setListing] = useState<{ key: string; data: HistoricalReportsPage | null; error: string } | null>(null);
  const [detail, setDetail] = useState<{ key: string; data: AnalyticalReport[]; error: string } | null>(null);
  const currentQuery = query?.identity === identityKey ? query : null;
  const filters = currentQuery?.filters ?? {};
  const key = JSON.stringify([identityKey, currentQuery]);
  const selected = selection?.key === identityKey ? selection : null;
  const detailKey = JSON.stringify([identityKey, selected]);
  const fail = (reason: unknown) => {
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) void auth.refreshIdentity();
    return reason instanceof AuthApiError && reason.serverMessage ? reason.serverMessage : 'No se pudieron consultar los reportes. Inténtalo nuevamente.';
  };

  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null);
    setSelection(null); setDetail(null);
    if (identity && allowed) void loadDashboardOptions(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalog({ key: identityKey, data });
    }).catch(() => { /* El catálogo vigente es opcional para consultar ámbitos históricos retirados. */ });
    return () => controller.abort();
  }, [identityKey]);

  useEffect(() => {
    const controller = new AbortController();
    setListing(null);
    if (identity && allowed) void loadHistoricalReports(filters, currentQuery?.cursor ?? null, controller.signal).then(data => {
      if (!controller.signal.aborted) setListing({ key, data, error: '' });
    }).catch(reason => {
      if (!controller.signal.aborted) {
        if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) { setSelection(null); setDetail(null); }
        setListing({ key, data: null, error: fail(reason) });
      }
    });
    return () => controller.abort();
  }, [key]);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    if (identity && allowed && selected?.ids.length) void Promise.all(selected.ids.map(id => loadHistoricalReport(id, controller.signal))).then(data => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, data, error: '' });
    }).catch(reason => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, data: [], error: fail(reason) });
    });
    return () => controller.abort();
  }, [detailKey]);

  const page = allowed && listing?.key === key ? listing.data : null;
  const error = allowed && listing?.key === key ? listing.error : '';
  const currentDetail = allowed && detail?.key === detailKey ? detail : null;
  return {
    allowed, identityKey, filters, page, error, loading: allowed && !page && !error,
    options: allowed && catalog?.key === identityKey ? catalog.data : null,
    reports: currentDetail?.data ?? [], detailError: currentDetail?.error ?? '',
    detailLoading: allowed && Boolean(selected?.ids.length) && !currentDetail,
    selectedIds: selected?.ids ?? [], hasPrevious: Boolean(currentQuery?.cursor),
    search(next: HistoricalReportsFilters = filters) {
      setSelection(null); setDetail(null);
      setQuery({ identity: identityKey, filters: next, cursor: null, revision: (currentQuery?.revision ?? 0) + 1 });
    },
    nextPage() {
      if (page?.nextCursor) setQuery({ identity: identityKey, filters, cursor: page.nextCursor, revision: (currentQuery?.revision ?? 0) + 1 });
    },
    firstPage() {
      setQuery({ identity: identityKey, filters, cursor: null, revision: (currentQuery?.revision ?? 0) + 1 });
    },
    open(id: string, compare = false) {
      setSelection({ key: identityKey, ids: compare && selected?.ids.length ? [...new Set([selected.ids[0], id])] : [id], revision: (selected?.revision ?? 0) + 1 });
    },
    retryDetail() { if (selected) setSelection({ ...selected, revision: selected.revision + 1 }); },
    close() { setSelection(null); },
  };
}
