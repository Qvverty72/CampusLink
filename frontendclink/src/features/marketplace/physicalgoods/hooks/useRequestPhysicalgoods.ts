import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { operationId } from '@/lib/api/operation-id';
import type { usePhysicalgoodsResources } from './usePhysicalgoodsResources';
import { loadPhysicalgoodsRequestOptions, requestPhysicalgoods } from '../api/physicalgoodsApi';
import type { PhysicalgoodsRequestOptions } from '../types/publication';

/** Consulta catálogo/solicitud propia, controla doble envío y descarta respuestas de recursos cerrados. */
export function useRequestPhysicalgoods(r: ReturnType<typeof usePhysicalgoodsResources>) {
  const auth = useAuth();
  const [options,setOptions] = useState<PhysicalgoodsRequestOptions | null>(null), [messageCode,setMessageCode] = useState('');
  const [loading,setLoading] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null), [revision,setRevision] = useState(0);
  const mutation = useRef<AbortController | null>(null), running = useRef(false);
  const operation = useRef<{id:string;code:string;key:string} | null>(null);
  const eligible = !!r.gallery && !!auth.identity?.userId && r.gallery.owner.id !== auth.identity.userId;
  function report(reason: unknown) {
    if (reason instanceof AuthApiError && [401,403].includes(reason.status)) void auth.refreshIdentity();
    setError(reason instanceof AuthApiError ? reason.serverMessage || 'No se pudo completar la solicitud.' : 'No se pudo completar la solicitud.');
  }
  useEffect(() => {
    setMessageCode(''); setError(null); setOptions(null); setBusy(false); running.current=false;
    return () => { mutation.current?.abort(); };
  },[r.selectedId]);
  useEffect(() => {
    const abort = new AbortController();
    if (!r.gallery || !eligible || busy) { setOptions(null); setLoading(false); return; }
    setLoading(true); setOptions(null);
    void loadPhysicalgoodsRequestOptions(r.gallery.id,abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setOptions(result); setMessageCode(previous => result.messages.some(row=>row.code===previous) ? previous : '');
      if (result.activeRequest) setError(null);
      if (!result.canRequest && !result.activeRequest && r.gallery?.acceptsRequests) r.reloadGallery();
    }).catch(reason => { if (!abort.signal.aborted) report(reason); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  },[r.gallery,eligible,revision,busy]);
  async function send() {
    if (running.current || !r.gallery || !options?.canRequest || !options.messages.some(row=>row.code===messageCode)) return;
    const id = r.gallery.id, abort = new AbortController(); mutation.current=abort; running.current=true; setBusy(true); setError(null);
    try {
      if (operation.current?.id !== id || operation.current.code !== messageCode) operation.current = {id,code:messageCode,key:operationId()};
      const receipt = await requestPhysicalgoods(id,messageCode,abort.signal,operation.current.key);
      operation.current = null;
      if (!abort.signal.aborted) setOptions({ canRequest:false,activeRequest:receipt,messages:[] });
    } catch (reason) {
      if (!abort.signal.aborted) { report(reason); if (reason instanceof AuthApiError && [404,409].includes(reason.status)) r.reloadGallery(); }
    } finally {
      if (!abort.signal.aborted) { running.current=false; setBusy(false); setRevision(value=>value+1); }
    }
  }
  return { options,messageCode,setMessageCode,loading,busy,error,eligible,send,
    reload: () => { setError(null); setRevision(value=>value+1); } };
}
