import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAccessCampuses } from '../api/accessApi';
import { loadAuditEntries, loadAuditEntry } from '../api/auditApi';
import type { AuditEntry, AuditDetail } from '../types/audit';

export function useAuditHistory() {
  const auth = useAuth();
  const [campuses,setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [campusId,setCampusId] = useState('');
  const [page,setPage] = useState(1);
  const [entries,setEntries] = useState<AuditEntry[]>([]);
  const [hasMore,setHasMore] = useState(false);
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
      setEntries([]); setSelected(null); setHasMore(false); void auth.refreshIdentity();
    }
  }
  // Context changes cancel requests and erase the previous actor's history immediately.
  const identityKey = auth.identity ? JSON.stringify([auth.identity.userId,auth.identity.campusId,auth.identity.roles]) : '';
  useEffect(() => {
    const controller = new AbortController();
    pending.current?.abort();
    if (loadedIdentity.current !== identityKey) {
      setCampuses([]); setCampusId(''); setPage(1); loadedIdentity.current = identityKey;
    }
    setEntries([]); setSelected(null); setHasMore(false); setLoading(true); setError('');
    void loadAccessCampuses(controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setCampuses(rows); setCampusId(current => rows.some(row => row.id === current) ? current : rows[0]?.id ?? ''); setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [identityKey,reload]);
  useEffect(() => {
    if (!campusId) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller;
    setLoading(true); setError(''); setSelected(null); setEntries([]); setHasMore(false);
    void loadAuditEntries(campusId,page,controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setEntries(result.data); setHasMore(result.meta.hasMore); setLoading(false);
    }).catch(reason => { if (!controller.signal.aborted) { fail(reason); setLoading(false); } });
    return () => controller.abort();
  }, [campusId,page,reload]);
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
  const selectCampus = (id: string) => {
    if (id !== campusId) { pending.current?.abort(); setSelected(null); setEntries([]); setPage(1); setCampusId(id); }
  };
  return { campuses, campusId, page, setPage, entries, hasMore, selected, setSelected, loading,
    error, setReload, select, selectCampus };
}
