import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {loadDigitalTrade,transitionDigitalTrade,rateDigitalOwner} from '../api/digitalTradesApi';
import type {DigitalTrade} from '../types/trade';
import {AuthApiError} from '@/lib/api/authenticated-request';

/** Presentation session; writes reuse the existing digital API and backend lifecycle. */
export function useDigitalTransactionPanel(initial:DigitalTrade,onSnapshot:(trade:DigitalTrade)=>void){
 const {identity}=useAuth(),[trade,setTrade]=useState(initial),[fresh,setFresh]=useState(false),[verified,setVerified]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const current=useRef(trade);current.current=trade;
 const snapshot=useRef(onSnapshot);snapshot.current=onSnapshot;
 const request=useRef<AbortController|null>(null),running=useRef(false),mounted=useRef(true);
 const read=useCallback(async()=>{if(running.current)return;request.current?.abort();const abort=new AbortController();request.current=abort;setLoading(true);setFresh(false);setError(null);
 try{const value=await loadDigitalTrade(initial.publicationId,initial.id,abort.signal);if(!abort.signal.aborted){current.current=value;setTrade(value);setFresh(true);setVerified(true);snapshot.current(value);}}
 catch(reason){if(!abort.signal.aborted){if(reason instanceof AuthApiError&&[401,403,404].includes(reason.status))setVerified(false);setError('No se pudo verificar el estado actual. Actualiza antes de continuar.');}}
 finally{if(!abort.signal.aborted)setLoading(false);}},[initial.id,initial.publicationId]);
 useEffect(()=>{mounted.current=true;void read();return()=>{mounted.current=false;request.current?.abort();};},[read]);
 async function run(action:'confirm'|'cancel'|'rate',score?:number){
  const value=current.current;if(running.current||!fresh||loading||error)return;
  if(action==='confirm'&&!value.canConfirm||action==='cancel'&&!value.canCancel||action==='rate'&&(!value.canRate||value.status!=='COMPLETADA'||value.ownerId===value.receiverId||value.receiverId!==identity?.userId||!Number.isInteger(score)||(score??0)<1||(score??0)>5))return;
  running.current=true;request.current?.abort();const abort=new AbortController();request.current=abort;setBusy(true);setFresh(false);setError(null);let failed=false;
  try{if(action==='rate')await rateDigitalOwner(value,score!,abort.signal);else await transitionDigitalTrade(value,action,abort.signal);}
  catch{failed=true;}
  try{const result=await loadDigitalTrade(value.publicationId,value.id,abort.signal);if(!abort.signal.aborted){
   current.current=result;setTrade(result);setFresh(true);snapshot.current(result);
   const observed=action==='rate'?result.rating?.score===score:action==='cancel'?result.status==='CANCELADA':result.confirmations.some(row=>row.userId===identity?.userId&&row.role===(result.ownerId===identity?.userId?'PROPIETARIO':'RECEPTOR'));
   if(failed&&!observed)setError('No se pudo confirmar el resultado. Actualiza el estado antes de reintentar.');
  }}catch{if(!abort.signal.aborted)setError('No se pudo verificar el resultado. Actualiza antes de reintentar.');}
  finally{running.current=false;if(mounted.current&&!abort.signal.aborted)setBusy(false);}
 }
 return {trade,fresh,verified,loading,busy,error,read,run,viewerId:identity?.userId};
}
