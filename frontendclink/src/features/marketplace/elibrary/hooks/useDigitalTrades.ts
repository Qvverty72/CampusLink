import { useEffect,useRef,useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { operationId } from '@/lib/api/operation-id';
import { loadDigitalRequestOptions,loadDigitalRequests,loadDigitalTrade,requestDigitalResource,resolveDigitalRequest,transitionDigitalTrade,rateDigitalOwner } from '../api/digitalTradesApi';
import type { DigitalRequest,DigitalRequestOptions,DigitalTrade,DigitalTradeTarget } from '../types/trade';
const message=(error:unknown)=>error instanceof AuthApiError?error.serverMessage??'No se pudo completar la operación.': 'No se pudo conectar. Revisa tu conexión. Si estabas guardando, actualiza el estado antes de reintentar.';
export function useDigitalRequestAction(id:string, enabled=true) {
  const [options,setOptions]=useState<DigitalRequestOptions|null>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const pending=useRef<AbortController|null>(null),saving=useRef(false);
  const [loading,setLoading]=useState(enabled);
  const operation=useRef<{id:string;code:string;key:string}|null>(null);
  useEffect(()=>setError(null),[id]);
  useEffect(()=>{const abort=new AbortController();setOptions(null);setCode('');setLoading(enabled);if(enabled)void loadDigitalRequestOptions(id,abort.signal).then(value=>{if(!abort.signal.aborted){setOptions(value);if(value.activeRequestId||value.acquired)setError(null);}}).catch(reason=>{if(!abort.signal.aborted)setError(message(reason));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>{abort.abort();pending.current?.abort();};},[id,revision,enabled]);
  async function submit(){if(saving.current||!enabled||!options?.canRequest||!options.messages.some(row=>row.code===code))return;saving.current=true;setBusy(true);setError(null);const abort=new AbortController();pending.current=abort;
    try{if(operation.current?.id!==id||operation.current.code!==code)operation.current={id,code,key:operationId()};await requestDigitalResource(id,code,abort.signal,operation.current.key);operation.current=null;return !abort.signal.aborted;}catch(reason){if(!abort.signal.aborted)setError(message(reason));return false;}
    finally{saving.current=false;if(!abort.signal.aborted){setBusy(false);setRevision(value=>value+1);}}}
  return {options,code,setCode,busy,loading,error,submit,reload:()=>{setError(null);setRevision(value=>value+1);}};
}
export function useDigitalTradeCenter(initialOpen=false,initialReceived=false) {
  const {identity}=useAuth();
  const [score,setScore]=useState(0);
  const [open,setOpen]=useState(initialOpen),[received,setReceived]=useState(initialReceived),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
  const [rows,setRows]=useState<DigitalRequest[]>([]),[trade,setTrade]=useState<DigitalTrade|null>(null);
  const [listLoading,setListLoading]=useState(initialOpen),[tradeLoading,setTradeLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const [selection,setSelection]=useState<{request:DigitalRequest;decision:'ACEPTAR'|'RECHAZAR'}|null>(null);
  const [tradeTarget,setTradeTarget]=useState<DigitalTradeTarget|null>(null),[action,setAction]=useState<'confirm'|'cancel'|null>(null);
  const transitionOutcome=useRef<{id:string;action:'confirm'|'cancel'}|null>(null);
  const ratingOutcome=useRef<{id:string;score:number}|null>(null);
  const pending=useRef<AbortController|null>(null),reading=useRef<AbortController|null>(null),saving=useRef(false);
  const polling=useRef<AbortController|null>(null);
  const outcome=useRef<{id:string;status:string}|null>(null);
  const loading=listLoading||tradeLoading;
  useEffect(()=>()=>{pending.current?.abort();reading.current?.abort();polling.current?.abort();},[]);
  useEffect(()=>{
    if(!open||busy||tradeTarget){setListLoading(false);return;}
    const abort=new AbortController();setListLoading(true);setRows([]);setHasMore(false);setSelection(null);
    void loadDigitalRequests(received,page,abort.signal).then(result=>{if(!abort.signal.aborted){
      setRows(result.data);setHasMore(result.meta.hasMore);
      if(outcome.current&&result.data.some(row=>row.id===outcome.current?.id&&row.status===outcome.current.status)){setError(null);outcome.current=null;}
    }}).catch(reason=>{if(!abort.signal.aborted)setError(message(reason));}).finally(()=>{if(!abort.signal.aborted)setListLoading(false);});
    return()=>abort.abort();
  },[open,received,page,revision,busy,tradeTarget?.transactionId]);
  function stopReading(){reading.current?.abort();polling.current?.abort();polling.current=null;setTradeLoading(false);}
  function reconcile(value:DigitalTrade){
    if(ratingOutcome.current?.id===value.id&&value.rating){
      if(value.rating.score===ratingOutcome.current.score)setError(null);
      ratingOutcome.current=null;setScore(0);
    }
    const outcome=transitionOutcome.current;
    if(outcome?.id===value.id&&((outcome.action==='cancel'&&value.status==='CANCELADA')||(outcome.action==='confirm'&&value.confirmations.some(row=>row.userId===identity?.userId&&row.role===(value.ownerId===identity?.userId?'PROPIETARIO':'RECEPTOR'))))){setError(null);transitionOutcome.current=null;}
  }
  async function readTrade(target:DigitalTradeTarget){
    stopReading();const abort=new AbortController();reading.current=abort;setError(null);setAction(null);setTradeLoading(true);
    if(trade?.id!==target.transactionId)setTrade(null);
    try{const value=await loadDigitalTrade(target.publicationId,target.transactionId,abort.signal);if(!abort.signal.aborted){setTrade(value);reconcile(value);}}
    catch(reason){if(!abort.signal.aborted)setError(message(reason));}finally{if(!abort.signal.aborted)setTradeLoading(false);}
  }
  async function showTrade(row:DigitalRequest){
    if(!row.transactionId||saving.current||selection)return;
    const target={publicationId:row.publicationId,transactionId:row.transactionId,title:row.title};setTradeTarget(target);setScore(0);return readTrade(target);
  }
  async function mutate(operation:(signal:AbortSignal)=>Promise<unknown>){
    if(saving.current)return;const abort=new AbortController();pending.current=abort;saving.current=true;setBusy(true);setError(null);setSelection(null);setAction(null);
    polling.current?.abort();polling.current=null;
    try{await operation(abort.signal);}catch(reason){if(!abort.signal.aborted)setError(message(reason));}
    finally{
      if(!abort.signal.aborted&&trade){try{const value=await loadDigitalTrade(trade.publicationId,trade.id,abort.signal);if(!abort.signal.aborted){setTrade(value);reconcile(value);}}catch(reason){if(!abort.signal.aborted)setError(message(reason));}}
      saving.current=false;if(!abort.signal.aborted){setBusy(false);setRevision(value=>value+1);}
    }
  }
  const canSelect=(row:DigitalRequest)=>open&&received&&!trade&&!loading&&!saving.current&&row.status==='PENDIENTE'&&rows.some(item=>item.id===row.id&&item.status==='PENDIENTE');
  function select(row:DigitalRequest,decision:'ACEPTAR'|'RECHAZAR'){if(canSelect(row)){setError(null);setSelection({request:row,decision});}}
  function resolve(){
    if(!selection||!canSelect(selection.request))return;
    const {request,decision}=selection;outcome.current={id:request.id,status:decision==='ACEPTAR'?'ACEPTADA':'RECHAZADA'};
    return mutate(signal=>resolveDigitalRequest(request,decision,signal));
  }
  function selectTransition(value:'confirm'|'cancel'){if(!saving.current&&!loading&&!error&&trade&&(value==='confirm'?trade.canConfirm:trade.canCancel))setAction(value);}
  function transition(){if(!action||saving.current||loading||!trade||(action==='confirm'?!trade.canConfirm:!trade.canCancel))return;transitionOutcome.current={id:trade.id,action};return mutate(signal=>transitionDigitalTrade(trade,action,signal));}
  function rate(){
    if(saving.current||loading||error||!trade?.canRate||trade.status!=='COMPLETADA'||trade.receiverId!==identity?.userId||!Number.isInteger(score)||score<1||score>5)return;
    ratingOutcome.current={id:trade.id,score};return mutate(signal=>rateDigitalOwner(trade,score,signal));
  }
  async function poll(){
    if(polling.current||saving.current||loading||error||action||selection||!trade||!['RESERVADA','PENDIENTE_CONFIRMACION'].includes(trade.status))return;
    const abort=new AbortController();polling.current=abort;
    try{const value=await loadDigitalTrade(trade.publicationId,trade.id,abort.signal);if(!abort.signal.aborted&&!saving.current){setTrade(value);reconcile(value);}}
    catch{/* La consulta automática conserva los datos visibles; la manual permite gestionar el error. */}
    finally{if(polling.current===abort)polling.current=null;}
  }
  function refresh(){if(saving.current||loading||selection||action)return;if(tradeTarget){void readTrade(tradeTarget);return;}setPage(1);setError(null);setRevision(value=>value+1);}
  return{open,received,page,hasMore,rows,trade,tradeTarget,action,viewerId:identity?.userId,loading,busy,error,selection,select,resolve,selectTransition,transition,poll,refresh,
    cancelTransition:()=>{if(!saving.current)setAction(null);},
    cancelSelection:()=>{if(!saving.current)setSelection(null);},
    score,setScore:(value:number)=>{if(!saving.current&&!loading&&trade?.canRate&&trade.status==='COMPLETADA'&&trade.receiverId===identity?.userId&&Number.isInteger(value)&&value>=1&&value<=5)setScore(value);},
    rate,
    toggle:()=>{if(!saving.current){stopReading();setOpen(value=>!value);setTradeTarget(null);setTrade(null);setAction(null);setSelection(null);setError(null);}},
    mode:(value:boolean)=>{if(!saving.current){stopReading();setReceived(value);setPage(1);setTradeTarget(null);setTrade(null);setAction(null);setSelection(null);setError(null);}},
    next:()=>{if(!loading&&!saving.current&&!selection&&hasMore)setPage(value=>value+1);},
    previous:()=>{if(!loading&&!saving.current&&!selection)setPage(value=>Math.max(1,value-1));},
    reload:()=>{if(!saving.current){if(tradeTarget){void readTrade(tradeTarget);return;}stopReading();setSelection(null);setError(null);setRevision(value=>value+1);}},showTrade,
    closeTrade:()=>{if(!saving.current){stopReading();setTradeTarget(null);setTrade(null);setAction(null);setError(null);setRevision(value=>value+1);}}};
}
