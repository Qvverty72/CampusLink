import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAccessCampuses } from '../api/accessApi';
import { loadAuditEntries, loadAuditEntry } from '../api/auditApi';
import type { AuditEntry, AuditDetail } from '../types/audit';
import { EMPTY_AUDIT_SEARCH, type AuditSearch } from '../types/audit';
import { auditDateRangeError, EMPTY_AUDIT_DATES, type AuditDateRange } from '../utils/auditDateRange';

/** Carga auditoría por campus y limpia el historial al cambiar identidad o permisos. */
export function useAuditHistory() {
  const auth = useAuth();
  const [campuses,setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [campusesReady,setCampusesReady] = useState(false);
  // Fuerza una nueva consulta aun si React agrupa ready=false/true en el mismo render.
  const [campusLoadVersion,setCampusLoadVersion] = useState(0);
  const [campusId,setCampusId] = useState('');
  const [action,setAction] = useState('');
  const [dates,setDates] = useState<AuditDateRange>(EMPTY_AUDIT_DATES);
  const [search,setSearch] = useState<AuditSearch>(EMPTY_AUDIT_SEARCH);
  const [page,setPage] = useState(1);
  const [entries,setEntries] = useState<AuditEntry[]>([]);
  const [hasMore,setHasMore] = useState(false);
  const [totalPages,setTotalPages] = useState(0);
  const [selected,setSelected] = useState<AuditDetail | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const loadedIdentity = useRef<string | null>(null);
  function fail(reason: unknown) {
    setError(reason instanceof AuthApiError && reason.status === 403 ? 'Tu acceso a este campus ya no está disponible.'
      : reason instanceof AuthApiError && reason.status === 401 ? 'Tu sesión venció. Inicia sesión nuevamente.'
      : reason instanceof AuthApiError && reason.status === 404 ? 'El registro no está disponible en este campus.'
      : 'No se pudo consultar el historial. Inténtalo nuevamente.');
    if (reason instanceof AuthApiError && [401,403].includes(reason.status)) {
      setEntries([]); setSelected(null); setHasMore(false); setTotalPages(0); void auth.refreshIdentity();
    }
  }
  // Un cambio de identidad o contexto cancela peticiones y borra enseguida el historial anterior.
  const identityKey = auth.identity ? JSON.stringify([auth.identity.userId,auth.identity.campusId,auth.identity.roles]) : '';
  useEffect(() => {
    const controller = new AbortController();
    pending.current?.abort();
    if (loadedIdentity.current !== identityKey) {
      setCampuses([]); setCampusId(''); setAction(''); setDates(EMPTY_AUDIT_DATES); setSearch(EMPTY_AUDIT_SEARCH); setPage(1); loadedIdentity.current = identityKey;
    }
    setCampusesReady(false); setEntries([]); setSelected(null); setHasMore(false); setTotalPages(0); setLoading(true); setError('');
    void loadAccessCampuses(controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setCampuses(rows); setCampusId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? '');
      setCampusesReady(true); setCampusLoadVersion(version => version + 1); if (!rows.length) setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [identityKey,reload]);
  useEffect(() => {
    // Recargar permisos y listado en paralelo podía repoblar una sede ya revocada.
    if (!campusesReady || !campusId) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setLoading(true); setError(''); setSelected(null); setEntries([]); setHasMore(false); setTotalPages(0);
    void loadAuditEntries(campusId,page,controller.signal,action,dates,search).then(result => {
      if (controller.signal.aborted) return;
      if (!Number.isSafeInteger(result.meta.total) || result.meta.total < 0 || !Number.isSafeInteger(result.meta.limit) || result.meta.limit < 1) {
        throw new Error('Invalid audit pagination metadata');
      }
      const pages = Math.max(1,Math.ceil(result.meta.total / result.meta.limit));
      if (page > pages) { setPage(pages); return; }
      setTotalPages(pages);
      setEntries(result.data); setHasMore(result.meta.hasMore); setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [campusId,page,action,dates,search,campusesReady,campusLoadVersion]);
  useEffect(() => () => pending.current?.abort(), []);
  async function select(id: string) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setSelected(null); setError(''); setLoading(true);
    try {
      const detail = await loadAuditEntry(campusId,id,controller.signal);
      if (!controller.signal.aborted) setSelected(detail);
    } catch (reason) { if (!controller.signal.aborted) fail(reason); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const applyFilters = (id: string, nextAction: string, nextDates: AuditDateRange = dates, nextSearch: AuditSearch = search) => {
    const names = { contentName:nextSearch.contentName.trim(),userName:nextSearch.userName.trim() };
    if (!campuses.some(campus => campus.id === id) || auditDateRangeError(nextDates) ||
      names.contentName.length > 100 || names.userName.length > 100 ||
      (id === campusId && nextAction === action && nextDates.from === dates.from && nextDates.to === dates.to && names.contentName === search.contentName && names.userName === search.userName)) return;
    pending.current?.abort(); setSelected(null); setEntries([]); setHasMore(false); setTotalPages(0); setError(''); setLoading(true);
    setPage(1); setCampusId(id); setAction(nextAction); setDates(nextDates); setSearch(names);
  };
  const selectCampus = (id: string) => applyFilters(id,action);
  const refresh = () => {
    if (loading || selected) return;
    // RefreshScrollView debe observar true desde el gesto, incluso si campus responde vacío inmediatamente.
    setLoading(true); setReload(value => value + 1);
  };
  return { campuses, campusId, action, dates, search, applyFilters, page, setPage, entries, hasMore, totalPages, selected, setSelected, loading,
    error, setReload, refresh, select, selectCampus, reportError: fail };
}
