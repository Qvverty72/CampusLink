import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {AuthApiError} from '@/lib/api/authenticated-request';
import {changePhysicalgoodsTransaction,loadPhysicalgoodsCoordinationMessages,loadPhysicalgoodsCoordinationOptions,loadPhysicalgoodsTransaction,sendPhysicalgoodsCoordination} from '../api/physicalgoodsApi';
import type {PhysicalgoodsCoordinationOptions,PhysicalgoodsCoordinationPage,PhysicalgoodsTransaction,PhysicalgoodsTransactionTarget} from '../types/publication';

/** Separa acuerdo, mensajes y ubicaciones: un fallo de Mongo no bloquea confirmar o cancelar. */
export function usePhysicalgoodsTransaction(target:PhysicalgoodsTransactionTarget,onChanged:()=>void) {
  const auth=useAuth();
  const [detail,setDetail]=useState<PhysicalgoodsTransaction|null>(null),[messages,setMessages]=useState<PhysicalgoodsCoordinationPage|null>(null);
  const [options,setOptions]=useState<PhysicalgoodsCoordinationOptions|null>(null),[buildingId,setBuildingId]=useState(''),[floorId,setFloorId]=useState('');
  const [loading,setLoading]=useState(false),[messagesLoading,setMessagesLoading]=useState(false),[optionsLoading,setOptionsLoading]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null),[messageError,setMessageError]=useState<string|null>(null),[optionsError,setOptionsError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0),[page,setPage]=useState(1),[action,setAction]=useState<'confirm'|'cancel'|null>(null);
  const mutation=useRef<AbortController|null>(null),running=useRef(false),outcome=useRef<'confirm'|'cancel'|null>(null);
  const sent=useRef<{text:string;previousIds:string[]}|null>(null),selection=useRef({buildingId,floorId});selection.current={buildingId,floorId};
  useEffect(()=>()=>mutation.current?.abort(),[]);
  function report(reason:unknown,setMessage:(value:string)=>void) {
    if(reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();
    setMessage(reason instanceof AuthApiError?reason.serverMessage||'No se pudo completar la operación.':'No se pudo completar la operación.');
  }
  useEffect(()=>{
    const abort=new AbortController();if(busy)return;
    setLoading(true);setDetail(null);
    void loadPhysicalgoodsTransaction(target,abort.signal).then(result=>{if(!abort.signal.aborted){
      setDetail(result);
      if((outcome.current==='cancel'&&result.status==='CANCELADA')||(outcome.current==='confirm'&&result.confirmations.some(value=>value.userId===auth.identity?.userId&&value.role===result.role))){setError(null);outcome.current=null;}
    }}).catch(reason=>{if(!abort.signal.aborted)report(reason,setError);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[target.publicationId,target.transactionId,revision,busy]);
  useEffect(()=>{
    const abort=new AbortController();if(busy)return;
    setMessagesLoading(true);setMessages(null);
    void loadPhysicalgoodsCoordinationMessages(target,page,abort.signal).then(result=>{if(!abort.signal.aborted){
      setMessages(result);
      if(sent.current&&result.data.some(value=>value.senderId===auth.identity?.userId&&value.text===sent.current?.text&&!sent.current.previousIds.includes(value.id))){setMessageError(null);sent.current=null;}
    }}).catch(reason=>{if(!abort.signal.aborted)report(reason,setMessageError);}).finally(()=>{if(!abort.signal.aborted)setMessagesLoading(false);});
    return()=>abort.abort();
  },[target.publicationId,target.transactionId,page,revision,busy]);
  useEffect(()=>{
    const abort=new AbortController();
    if(!detail?.canCancel||busy){setOptions(null);setOptionsLoading(false);return;}
    setOptionsLoading(true);setOptions(null);setOptionsError(null);
    void loadPhysicalgoodsCoordinationOptions(target,abort.signal).then(result=>{if(!abort.signal.aborted){
      setOptions(result);
      const building=result.buildings.find(value=>value.id===selection.current.buildingId);
      if(!building)setBuildingId('');
      if(!building?.floors.some(value=>value.id===selection.current.floorId))setFloorId('');
    }}).catch(reason=>{if(!abort.signal.aborted)report(reason,setOptionsError);}).finally(()=>{if(!abort.signal.aborted)setOptionsLoading(false);});
    return()=>abort.abort();
  },[detail,revision,busy,target.publicationId,target.transactionId]);
  const building=options?.buildings.find(value=>value.id===buildingId),floor=building?.floors.find(value=>value.id===floorId);
  const preview=building&&floor?`Estoy en ${building.name}, en ${floor.name}.`:null;
  async function perform(kind:'confirm'|'cancel'|'message') {
    if(running.current||!detail||(kind==='confirm'&&!detail.canConfirm)||(kind==='cancel'&&!detail.canCancel)||(kind==='message'&&(!detail.canCancel||!preview)))return;
    const abort=new AbortController();mutation.current=abort;running.current=true;setBusy(true);setAction(null);
    if(kind==='message'){setMessageError(null);sent.current=null;}
    else{setError(null);outcome.current=kind;}
    try {
      if(kind==='message'){
        // La página visible puede ser antigua; compara contra el historial más reciente antes de enviar.
        const before=await loadPhysicalgoodsCoordinationMessages(target,1,abort.signal);
        if(abort.signal.aborted)return;
        sent.current={text:preview!,previousIds:before.data.map(value=>value.id)};
        await sendPhysicalgoodsCoordination(target,buildingId,floorId,abort.signal);
      }
      else await changePhysicalgoodsTransaction(target,kind,abort.signal);
    }catch(reason){if(!abort.signal.aborted){report(reason,kind==='message'?setMessageError:setError);}}
    finally{if(!abort.signal.aborted){running.current=false;setBusy(false);setPage(1);setRevision(value=>value+1);if(kind!=='message')onChanged();}}
  }
  return {detail,historical:!!detail&&detail.campus.id!==auth.identity?.campusId,messages,options,buildingId,floorId,building,preview,loading,messagesLoading,optionsLoading,busy,error,messageError,optionsError,page,action,
    selectAction:(value:'confirm'|'cancel')=>{if(!running.current)setAction(value);},cancelAction:()=>{if(!running.current)setAction(null);},
    confirm:()=>perform('confirm'),cancel:()=>perform('cancel'),send:()=>perform('message'),
    setBuilding:(value:string)=>{if(!running.current){setBuildingId(value);setFloorId('');}},setFloor:(value:string)=>{if(!running.current)setFloorId(value);},
    setPage:(value:number)=>{if(!running.current){setMessageError(null);setPage(value);}},
    reload:()=>{if(!running.current){setError(null);setMessageError(null);setAction(null);setRevision(value=>value+1);}}};
}
