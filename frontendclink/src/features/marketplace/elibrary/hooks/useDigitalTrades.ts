import { useEffect,useRef,useState } from 'react';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadDigitalRequestOptions,loadDigitalRequests,loadDigitalTrade,requestDigitalResource,resolveDigitalRequest,transitionDigitalTrade } from '../api/digitalTradesApi';
import type { DigitalRequest,DigitalRequestOptions,DigitalTrade } from '../types/trade';
const message=(error:unknown)=>error instanceof AuthApiError?error.serverMessage??'No se pudo completar la operación.': 'No se pudo conectar. Revisa tu conexión. Si estabas guardando, actualiza el estado antes de reintentar.';
export function useDigitalRequestAction(id:string) {
  const [options,setOptions]=useState<DigitalRequestOptions|null>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const pending=useRef<AbortController|null>(null),saving=useRef(false);
  useEffect(()=>{const abort=new AbortController();setOptions(null);setCode('');void loadDigitalRequestOptions(id,abort.signal).then(value=>{if(!abort.signal.aborted)setOptions(value);}).catch(reason=>{if(!abort.signal.aborted)setError(message(reason));});return()=>{abort.abort();pending.current?.abort();};},[id,revision]);
  async function submit(){if(saving.current||!code)return;saving.current=true;setBusy(true);setError(null);const abort=new AbortController();pending.current=abort;
    try{await requestDigitalResource(id,code,abort.signal);}catch(reason){if(!abort.signal.aborted)setError(message(reason));}
    finally{saving.current=false;if(!abort.signal.aborted){setBusy(false);setRevision(value=>value+1);}}}
  return {options,code,setCode,busy,error,submit,reload:()=>{setError(null);setRevision(value=>value+1);}};
}
export function useDigitalTradeCenter() {
  const [open,setOpen]=useState(false),[received,setReceived]=useState(false),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
  const [rows,setRows]=useState<DigitalRequest[]>([]),[trade,setTrade]=useState<DigitalTrade|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const pending=useRef<AbortController|null>(null),reading=useRef<AbortController|null>(null),saving=useRef(false);
  useEffect(()=>()=>{pending.current?.abort();reading.current?.abort();},[]);
  useEffect(()=>{if(!open)return;const abort=new AbortController();setLoading(true);setRows([]);setHasMore(false);
    void loadDigitalRequests(received,page,abort.signal).then(result=>{if(!abort.signal.aborted){setRows(result.data);setHasMore(result.meta.hasMore);}}).catch(reason=>{if(!abort.signal.aborted)setError(message(reason));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[open,received,page,revision]);
  async function showTrade(row:DigitalRequest){if(!row.transactionId||saving.current)return;reading.current?.abort();const abort=new AbortController();reading.current=abort;setError(null);setLoading(true);
    try{const value=await loadDigitalTrade(row.publicationId,row.transactionId,abort.signal);if(!abort.signal.aborted)setTrade(value);}catch(reason){if(!abort.signal.aborted)setError(message(reason));}finally{if(!abort.signal.aborted)setLoading(false);}}
  async function mutate(operation:(signal:AbortSignal)=>Promise<unknown>){if(saving.current)return;const abort=new AbortController();pending.current=abort;saving.current=true;setBusy(true);setError(null);
    try{await operation(abort.signal);}catch(reason){if(!abort.signal.aborted)setError(message(reason));}
    finally{saving.current=false;if(!abort.signal.aborted){if(trade){try{setTrade(await loadDigitalTrade(trade.publicationId,trade.id,abort.signal));}catch(reason){if(!abort.signal.aborted)setError(message(reason));}}if(!abort.signal.aborted){setBusy(false);setRevision(value=>value+1);}}}}
  return{open,received,page,hasMore,rows,trade,loading,busy,error,
    toggle:()=>{if(!saving.current){reading.current?.abort();setOpen(value=>!value);setTrade(null);setError(null);}},
    mode:(value:boolean)=>{if(!saving.current){reading.current?.abort();setReceived(value);setPage(1);setTrade(null);setError(null);}},
    next:()=>{if(!loading&&hasMore)setPage(value=>value+1);},previous:()=>setPage(value=>Math.max(1,value-1)),
    reload:()=>{setError(null);setRevision(value=>value+1);},showTrade,
    closeTrade:()=>{if(!saving.current){reading.current?.abort();setTrade(null);setError(null);setRevision(value=>value+1);}},
    resolve:(row:DigitalRequest,decision:'ACEPTAR'|'RECHAZAR')=>mutate(signal=>resolveDigitalRequest(row,decision,signal)),
    transition:(action:'confirm'|'cancel')=>trade&&mutate(signal=>transitionDigitalTrade(trade,action,signal))};
}
