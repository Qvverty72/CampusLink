import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {AuthApiError} from '@/lib/api/authenticated-request';
import {loadPhysicalgoodsRequestCounts} from '../api/physicalgoodsApi';
import type {PhysicalgoodsRequestCounts} from '../types/publication';

// Solo conserva el último contexto en memoria; nunca persiste datos de otra cuenta/campus.
let cached:{scope:string;counts:PhysicalgoodsRequestCounts}|null=null;

/** Lectura ligera que no espera ni depende de la página de solicitudes seleccionada. */
export function usePhysicalgoodsRequestCounts(active:boolean,refreshVersion=0){
  const auth=useAuth(),scope=`${auth.identity?.userId??''}:${auth.identity?.campusId??''}`;
  const [result,setResult]=useState<{scope:string;counts:PhysicalgoodsRequestCounts}|null>(null);
  const [revision,setRevision]=useState(0),[pending,setPending]=useState(active);
  const [failure,setFailure]=useState<string|null>(null);
  const counts=cached?.scope===scope?cached.counts:result?.scope===scope?result.counts:undefined;
  useEffect(()=>{
    const abort=new AbortController();
    if(!active){setPending(false);return;}
    setPending(true);setFailure(null);
    void loadPhysicalgoodsRequestCounts(abort.signal).then(value=>{
      if(abort.signal.aborted)return;
      const next={scope,counts:value};cached=next;setResult(next);
    }).catch(reason=>{
      if(abort.signal.aborted)return;
      if(reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();
      setFailure('No se pudieron actualizar los contadores de solicitudes.');
    }).finally(()=>{if(!abort.signal.aborted)setPending(false);});
    return()=>abort.abort();
  },[active,scope,refreshVersion,revision]);
  const reload=useCallback(()=>setRevision(value=>value+1),[]);
  return {counts,loading:active&&!counts&&(pending||!failure),error:failure,reload};
}
