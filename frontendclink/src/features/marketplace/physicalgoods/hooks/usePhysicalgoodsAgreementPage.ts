import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadPhysicalgoodsTransaction } from '../api/physicalgoodsApi';
import type { PhysicalgoodsTransaction, PhysicalgoodsTransactionSummary } from '../types/publication';

/** Solo enriquece la página visible; hasta tres lecturas concurrentes, todas cancelables. */
export function usePhysicalgoodsAgreementPage(rows: PhysicalgoodsTransactionSummary[], enabled: boolean) {
  const auth = useAuth();
  const scope = `${auth.identity?.userId}:${auth.identity?.campusId}`;
  const key = `${scope}|${rows.map(row => `${row.publication.id}:${row.id}`).join('|')}`;
  const [cache, setCache] = useState<{ key: string; details: Record<string, PhysicalgoodsTransaction>; failed: string[] }>({ key, details: {}, failed: [] });
  const [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const current = useRef({ key, rows, enabled }); current.current = { key, rows, enabled };
  const targeted = useRef(new Map<string, AbortController>());
  const isCurrent = () => current.current.enabled && current.current.key === key && current.current.rows === rows;
  const accepts = (detail: PhysicalgoodsTransaction) => rows.some(row => row.id === detail.id && row.publication.id === detail.publication.id)
    && (detail.role === 'PROPIETARIO' ? detail.owner.id : detail.receiver.id) === auth.identity?.userId;
  const update = useCallback((detail: PhysicalgoodsTransaction) => {
    if (!isCurrent() || !accepts(detail)) return;
    setCache(previous => {
      if (previous.key !== key) return previous;
      const failed = previous.failed.filter(id => id !== detail.id);
      if (failed.length === previous.failed.length && JSON.stringify(previous.details[detail.id]) === JSON.stringify(detail)) return previous;
      return { key, details: { ...previous.details, [detail.id]: detail }, failed };
    });
  }, [key, rows, enabled]);
  const invalidate = useCallback((publicationId: string, transactionId: string) => {
    if (!isCurrent() || !rows.some(row => row.id === transactionId && row.publication.id === publicationId)) return;
    setCache(previous => {
      if (previous.key !== key || (!previous.details[transactionId] && previous.failed.includes(transactionId))) return previous;
      const details = { ...previous.details }; delete details[transactionId];
      return { ...previous, details, failed: previous.failed.includes(transactionId) ? previous.failed : [...previous.failed, transactionId] };
    });
  }, [key, rows, enabled]);
  const failedRead = (id: string, reason: unknown) => {
    if (!isCurrent()) return;
    setCache(previous => {
      if (previous.key !== key) return previous;
      const denied = reason instanceof AuthApiError && [401, 403].includes(reason.status);
      const details = { ...previous.details }; if (denied) delete details[id];
      return { ...previous, details, failed: previous.failed.includes(id) ? previous.failed : [...previous.failed, id] };
    });
    if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) void auth.refreshIdentity();
  };
  const refresh = useCallback(async (publicationId: string, transactionId: string) => {
    if (!isCurrent() || !rows.some(row => row.id === transactionId && row.publication.id === publicationId)) return;
    targeted.current.get(transactionId)?.abort();
    const abort = new AbortController(); targeted.current.set(transactionId, abort);
    try {
      const detail = await loadPhysicalgoodsTransaction({ publicationId, transactionId }, abort.signal);
      if (!abort.signal.aborted && isCurrent()) {
        if (!accepts(detail) || detail.id !== transactionId || detail.publication.id !== publicationId) throw new Error('Transaction identity mismatch');
        update(detail);
      }
    } catch (reason) { if (!abort.signal.aborted) failedRead(transactionId, reason); }
    finally { if (targeted.current.get(transactionId) === abort) targeted.current.delete(transactionId); }
  }, [key, rows, enabled, update]);
  useEffect(() => {
    const abort = new AbortController();
    setCache({ key, details: {}, failed: [] });
    if (!enabled || !rows.length) { setLoading(false); return () => abort.abort(); }
    setLoading(true);
    let next = 0;
    const worker = async () => {
      while (!abort.signal.aborted && next < rows.length) {
        const row = rows[next++];
        try {
          const result = await loadPhysicalgoodsTransaction({ publicationId: row.publication.id, transactionId: row.id }, abort.signal);
          if (!abort.signal.aborted) {
            if (!accepts(result) || result.id !== row.id || result.publication.id !== row.publication.id) throw new Error('Transaction identity mismatch');
            update(result);
          }
        } catch (reason) {
          if (!abort.signal.aborted) {
            failedRead(row.id, reason);
          }
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker)).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); targeted.current.forEach(request => request.abort()); targeted.current.clear(); };
  }, [rows, enabled, revision, auth.identity?.userId, auth.identity?.campusId]);
  return { details: enabled && cache.key === key ? cache.details : {}, failed: enabled && cache.key === key ? cache.failed : [], loading,
    scope, campusId: auth.identity?.campusId, update, invalidate, refresh, reload: () => setRevision(value => value + 1) };
}
