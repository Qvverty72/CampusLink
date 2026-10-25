import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {AuthApiError} from '@/lib/api/authenticated-request';
import {loadOwnPhysicalgoods,loadOwnPhysicalgoodsDetail,loadOwnPhysicalgoodsRequest,loadOwnPhysicalgoodsTransactions} from '../api/physicalgoodsApi';
import type {PhysicalgoodsOwnDetail,PhysicalgoodsOwnPage,PhysicalgoodsReceivedRequest,PhysicalgoodsTransactionsPage,PhysicalgoodsPublicationsTab} from '../types/publication';

export type PhysicalgoodsHistoryTarget={publicationId:string;requestId?:string};

/** Comparte paginación de las dos vistas históricas sin añadir estado global. */
export function usePhysicalgoodsHistory(active:boolean,transactions:boolean,refreshVersion:number,publicationTab?:PhysicalgoodsPublicationsTab) {
  const auth=useAuth();
  const [page,setPage]=useState<PhysicalgoodsOwnPage|PhysicalgoodsTransactionsPage|null>(null),[number,setNumber]=useState(1);
  const [loading,setLoading]=useState(active),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();if(!active)return;
    setLoading(true);setPage(null);setError(null);
    void (transactions?loadOwnPhysicalgoodsTransactions(number,abort.signal):loadOwnPhysicalgoods(number,abort.signal,publicationTab))
      .then(result=>{if(!abort.signal.aborted)setPage(result);})
      .catch(reason=>{if(!abort.signal.aborted){
        if(reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();
        setError(reason instanceof AuthApiError?reason.serverMessage||'No se pudo cargar el historial.':'No se pudo cargar el historial.');
      }}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[active,transactions,number,revision,refreshVersion,publicationTab,auth.identity?.userId,auth.identity?.campusId]);
  const reload=useCallback(()=>setRevision(value=>value+1),[]);
  return {page,number,loading,error,setNumber,reload};
}
/** Cada apertura consulta el estado actual y descarta respuestas tardías al cerrar. */
export function usePhysicalgoodsHistoryDetail(target:PhysicalgoodsHistoryTarget) {
  const auth=useAuth();
  const [detail,setDetail]=useState<PhysicalgoodsOwnDetail|PhysicalgoodsReceivedRequest|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();setDetail(null);setError(null);setLoading(true);
    void (target.requestId?loadOwnPhysicalgoodsRequest(target.publicationId,target.requestId,abort.signal):loadOwnPhysicalgoodsDetail(target.publicationId,abort.signal))
      .then(result=>{if(!abort.signal.aborted)setDetail(result);})
      .catch(reason=>{if(!abort.signal.aborted){
        if(reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();
        setError(reason instanceof AuthApiError?reason.serverMessage||'No se pudo cargar el detalle.':'No se pudo cargar el detalle.');
      }}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[target.publicationId,target.requestId,revision]);
  return {detail,loading,error,reload:()=>setRevision(value=>value+1)};
}
