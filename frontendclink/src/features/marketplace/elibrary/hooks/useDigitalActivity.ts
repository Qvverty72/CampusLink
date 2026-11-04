import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {AuthApiError} from '@/lib/api/authenticated-request';
import {loadDigitalActivityCounts,loadDigitalActivityPage} from '../api/digitalActivityApi';
import type {DigitalActivityCounts,DigitalActivityPage} from '../types/activity';

export function useDigitalActivityPage<T>(kind:string,query:string,active=true){
 const {identity}=useAuth(),scope=`${identity?.userId}:${identity?.campusId}`,key=`${scope}:${kind}:${query}`;
 const [state,setState]=useState<{key:string;value:DigitalActivityPage<T>|null;loading:boolean;error:string|null}>({key,value:null,loading:true,error:null});
 const [revision,setRevision]=useState(0);
 useEffect(()=>{if(!active)return;const abort=new AbortController();
 setState(old=>({key,value:old.key===key?old.value:null,loading:true,error:null}));
 void loadDigitalActivityPage<T>(kind,query,abort.signal).then(value=>{if(!abort.signal.aborted)setState({key,value,loading:false,error:null});})
 .catch(error=>{if(!abort.signal.aborted)setState(old=>({key,value:old.key===key&&!(error instanceof AuthApiError&&[401,403,404].includes(error.status))?old.value:null,loading:false,error:'No se pudo cargar esta sección. Reintenta la consulta.'}));});
 return()=>abort.abort();},[key,active,revision]);
 const value=state.key===key?state.value:null,error=state.key===key?state.error:null;
 const reload=useCallback(()=>setRevision(value=>value+1),[]);
 const update=useCallback((change:(value:DigitalActivityPage<T>)=>DigitalActivityPage<T>)=>setState(old=>old.key===key&&old.value?{...old,value:change(old.value)}:old),[key]);
 return {value,error,loading:state.key!==key||state.loading,initialLoading:!value&&!error,reload,update,scope};
}
export function useDigitalActivityCounts(active=true){
 const {identity}=useAuth(),key=`${identity?.userId}:${identity?.campusId}`;
 const cache=useRef<{key:string;value:DigitalActivityCounts}|null>(null);
 const [state,setState]=useState<{key:string;value:DigitalActivityCounts|null;loading:boolean}>({key,value:null,loading:true}),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!active)return;const abort=new AbortController();setState({key,value:cache.current?.key===key?cache.current.value:null,loading:true});
 void loadDigitalActivityCounts(abort.signal).then(value=>{if(!abort.signal.aborted){cache.current={key,value};setState({key,value,loading:false});}})
 .catch(error=>{if(!abort.signal.aborted){if(error instanceof AuthApiError&&[401,403].includes(error.status))cache.current=null;setState({key,value:cache.current?.key===key?cache.current.value:null,loading:false});}});
 return()=>abort.abort();},[key,active,revision]);
 return {counts:state.key===key?state.value:null,loading:state.key!==key||state.loading,reload:useCallback(()=>setRevision(value=>value+1),[])};
}
