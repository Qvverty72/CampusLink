import { useCallback,useEffect,useRef,useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadPhysicalgoodsRequests,resolvePhysicalgoodsRequest } from '../api/physicalgoodsApi';
import type { PhysicalgoodsReceivedPage,PhysicalgoodsReceivedRequest } from '../types/publication';

/** Mantiene página y confirmación; después de cualquier envío vuelve a consultar el estado real. */
export function usePhysicalgoodsRequests(active:boolean,onResolved:()=>void,received=true,refreshVersion=0) {
  const auth=useAuth();
  const [page,setPage]=useState<PhysicalgoodsReceivedPage|null>(null),[number,setNumber]=useState(1),[revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(active),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [selection,setSelection]=useState<{request:PhysicalgoodsReceivedRequest;decision:'ACEPTAR'|'RECHAZAR'}|null>(null);
  const mutation=useRef<AbortController|null>(null),running=useRef(false);
  const outcome=useRef<{id:string;status:'ACEPTADA'|'RECHAZADA'}|null>(null);
  useEffect(()=>()=>{mutation.current?.abort();},[]);
  function report(reason:unknown) {
    if(reason instanceof AuthApiError&&[401,403].includes(reason.status)) void auth.refreshIdentity();
    setError(reason instanceof AuthApiError?reason.serverMessage||'No se pudo resolver la solicitud.':'No se pudo resolver la solicitud.');
  }
  useEffect(()=>{
    const abort=new AbortController();
    if(!active||busy) return;
    setLoading(true);setPage(null);setSelection(null);
    void loadPhysicalgoodsRequests(number,received,abort.signal).then(result=>{if(!abort.signal.aborted){
      setPage(result);
      if(outcome.current&&result.data.some(row=>row.id===outcome.current?.id&&row.status===outcome.current.status)){setError(null);outcome.current=null;}
    }})
      .catch(reason=>{if(!abort.signal.aborted)report(reason);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[active,number,revision,busy,received,refreshVersion]);
  async function resolve() {
    if(!selection||!canSelect(selection.request,selection.decision)) return;
    const {request,decision}=selection,abort=new AbortController();mutation.current=abort;running.current=true;setBusy(true);setError(null);setSelection(null);
    outcome.current={id:request.id,status:decision==='ACEPTAR'?'ACEPTADA':'RECHAZADA'};
    try { await resolvePhysicalgoodsRequest(request.publication.id,request.id,decision,abort.signal); }
    catch(reason) { if(!abort.signal.aborted)report(reason); }
    finally {if(!abort.signal.aborted){running.current=false;setBusy(false);setRevision(value=>value+1);onResolved();}}
  }
  const reload=useCallback(()=>{if(!running.current){setError(null);setSelection(null);setRevision(value=>value+1);}},[]);
  const canSelect=(request:PhysicalgoodsReceivedRequest,decision:'ACEPTAR'|'RECHAZAR')=>active&&received&&!loading&&!running.current
    &&page?.data.some(row=>row.id===request.id&&row.canResolve&&row.status==='PENDIENTE'&&(decision==='RECHAZAR'||row.publication.status==='DISPONIBLE'));
  return {page,number,loading,busy,error,selection,resolve,
    select:(request:PhysicalgoodsReceivedRequest,decision:'ACEPTAR'|'RECHAZAR')=>{if(canSelect(request,decision)){setError(null);setSelection({request,decision});}},
    cancel:()=>{if(!running.current)setSelection(null);},
    reload,
    setNumber:(value:number)=>{if(!running.current&&!loading&&!selection){setError(null);setNumber(Math.max(1,value));}}};
}
