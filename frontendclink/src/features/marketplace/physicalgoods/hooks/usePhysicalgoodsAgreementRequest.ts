import { useEffect, useRef, useState } from 'react';
import { findAgreementRequest } from '../api/findAgreementRequest';
import { agreementCopy as copy } from '../../utils/agreementPresentation';
import type { PhysicalgoodsTransactionTarget } from '../types/publication';
import type { PhysicalgoodsHistoryTarget } from './usePhysicalgoodsHistory';

export function usePhysicalgoodsAgreementRequest(target: PhysicalgoodsTransactionTarget) {
  const abort = useRef<AbortController | null>(null);
  const [request, setRequest] = useState<PhysicalgoodsHistoryTarget | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { setRequest(null); setError(null); setLoading(false); return () => { abort.current?.abort(); abort.current = null; }; }, [target.publicationId, target.transactionId]);
  async function open(received: boolean) {
    if (abort.current) return;
    const current = new AbortController(); abort.current = current; setLoading(true); setError(null);
    try {
      const result = await findAgreementRequest(target, received, current.signal);
      if (!current.signal.aborted) { if (result) setRequest(result); else setError(copy.lookupError); }
    } catch { if (!current.signal.aborted) setError(copy.lookupError); }
    finally { if (abort.current === current) { abort.current = null; setLoading(false); } }
  }
  return { request, loading, error, open, close: () => setRequest(null) };
}
