import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {AuthApiError} from '@/lib/api/authenticated-request';
import {loadPhysicalgoodsTransactionsPage} from '../api/physicalgoodsApi';
import type {PhysicalgoodsTransactionTab,PhysicalgoodsTransactionsTabPage} from '../types/publication';

export const TRANSACTIONS_PAGE_SIZE=5;

/** Paginación propia por estado; no descarga el historial completo para obtener totales. */
export function usePhysicalgoodsTransactions(active:boolean,refreshVersion:number) {
  const auth=useAuth(),scope=`${auth.identity?.userId}:${auth.identity?.campusId}`;
  const [navigation,setNavigation]=useState({scope,tab:'active' as PhysicalgoodsTransactionTab,number:1,refreshVersion});
  const tab=navigation.scope===scope?navigation.tab:'active';
  const number=navigation.scope===scope&&navigation.refreshVersion===refreshVersion?navigation.number:1;
  const key=`${scope}:${tab}:${number}`;
  const [result,setResult]=useState<{key:string;page:PhysicalgoodsTransactionsTabPage|null;error:string|null}|null>(null);
  const [pending,setPending]=useState(active),[revision,setRevision]=useState(0);
  const page=result?.key===key?result.page:null,error=result?.key===key?result.error:null;
  const loading=active&&(pending||result?.key!==key);
  useEffect(()=>{
    const abort=new AbortController();
    if(!active){setPending(false);return;}
    setPending(true);
    void loadPhysicalgoodsTransactionsPage(number,tab,abort.signal).then(value=>{
      if(abort.signal.aborted)return;
      if(number>Math.max(1,value.meta.totalPages)){
        setNavigation({scope,tab,number:Math.max(1,value.meta.totalPages),refreshVersion});return;
      }
      setResult({key,page:value,error:null});
    }).catch(reason=>{
      if(abort.signal.aborted)return;
      if(reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();
      setResult({key,page:null,error:reason instanceof AuthApiError?reason.serverMessage||'No se pudieron cargar tus transacciones.':'No se pudieron cargar tus transacciones.'});
    }).finally(()=>{if(!abort.signal.aborted)setPending(false);});
    return()=>abort.abort();
  },[active,key,revision,refreshVersion]);
  const reload=useCallback(()=>{setPending(true);setNavigation({scope,tab,number:1,refreshVersion});setRevision(value=>value+1);},[scope,tab,refreshVersion]);
  const refreshCurrent=useCallback(()=>{setPending(true);setRevision(value=>value+1);},[]);
  return {page,number,tab,error,loading,reload,refreshCurrent,
    setTab:(value:PhysicalgoodsTransactionTab)=>{if(value!==tab){setPending(true);setNavigation({scope,tab:value,number:1,refreshVersion});}},
    setNumber:(value:number)=>{if(!loading&&page&&Number.isInteger(value)&&value>=1&&value<=page.meta.totalPages&&value!==number){setPending(true);setNavigation({scope,tab,number:value,refreshVersion});}},
  };
}
