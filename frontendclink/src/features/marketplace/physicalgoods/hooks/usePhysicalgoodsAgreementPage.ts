import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadPhysicalgoodsTransaction } from '../api/physicalgoodsApi';
import type { PhysicalgoodsTransaction, PhysicalgoodsTransactionSummary } from '../types/publication';

/** Solo enriquece la página visible; hasta tres lecturas concurrentes, todas cancelables. */
export function usePhysicalgoodsAgreementPage(rows: PhysicalgoodsTransactionSummary[], enabled: boolean) {
  const auth = useAuth();
  const [details, setDetails] = useState<Record<string, PhysicalgoodsTransaction>>({});
  const [failed, setFailed] = useState<string[]>([]), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setDetails({}); setFailed([]);
    if (!enabled || !rows.length) { setLoading(false); return () => abort.abort(); }
    setLoading(true);
    let next = 0;
    const worker = async () => {
      while (!abort.signal.aborted && next < rows.length) {
        const row = rows[next++];
        try {
          const result = await loadPhysicalgoodsTransaction({ publicationId: row.publication.id, transactionId: row.id }, abort.signal);
          if (!abort.signal.aborted) setDetails(previous => ({ ...previous, [row.id]: result }));
        } catch (reason) {
          if (!abort.signal.aborted) {
            setFailed(previous => [...previous, row.id]);
            if (reason instanceof AuthApiError && [401, 403].includes(reason.status)) void auth.refreshIdentity();
          }
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker)).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [rows, enabled, revision, auth.identity?.userId, auth.identity?.campusId]);
  return { details, failed, loading, reload: () => setRevision(value => value + 1) };
}
