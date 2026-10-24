import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {AuthApiError} from '@/lib/api/authenticated-request';
import {changePhysicalgoodsTransaction,loadPhysicalgoodsCoordinationMessages,loadPhysicalgoodsCoordinationOptions,loadPhysicalgoodsTransaction,ratePhysicalgoodsOwner,sendPhysicalgoodsCoordination} from '../api/physicalgoodsApi';
import type {PhysicalgoodsCoordinationOptions,PhysicalgoodsCoordinationPage,PhysicalgoodsTransaction,PhysicalgoodsTransactionTarget} from '../types/publication';

/** Separa acuerdo, mensajes y ubicaciones: un fallo de Mongo no bloquea confirmar o cancelar. */
export function usePhysicalgoodsTransaction(target:PhysicalgoodsTransactionTarget,onChanged:()=>void) {
  const auth=useAuth();
  const contextKey=`${auth.identity?.userId}:${auth.identity?.campusId}:${target.publicationId}:${target.transactionId}`;
  const detailContext=useRef(contextKey),messageContext=useRef(contextKey),optionsContext=useRef(contextKey);
  const [detail,setDetail]=useState<PhysicalgoodsTransaction|null>(null),[messages,setMessages]=useState<PhysicalgoodsCoordinationPage|null>(null);
  const [options,setOptions]=useState<PhysicalgoodsCoordinationOptions|null>(null),[buildingId,setBuildingId]=useState(''),[floorId,setFloorId]=useState('');
  const [poiKey,setPoiKey]=useState('');
  const [loading,setLoading]=useState(true),[messagesLoading,setMessagesLoading]=useState(true),[optionsLoading,setOptionsLoading]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null),[messageError,setMessageError]=useState<string|null>(null),[optionsError,setOptionsError]=useState<string|null>(null);
  const [accessDenied,setAccessDenied]=useState(false);
  const [revision,setRevision]=useState(0),[page,setPage]=useState(1),[action,setAction]=useState<'confirm'|'cancel'|null>(null);
  const [detailRevision,setDetailRevision]=useState(0),detailRead=useRef(false);
  const [detailRefreshing,setDetailRefreshing]=useState(false);
  const [operation,setOperation]=useState<'confirm'|'cancel'|'message'|'rating'|null>(null);
  const [optionsRevision,setOptionsRevision]=useState(0),[messagesRevision,setMessagesRevision]=useState(0);
  const [messagesRefreshing,setMessagesRefreshing]=useState(false);
  const [ratingScore,setRatingScore]=useState<number|null>(null),[ratingConfirmation,setRatingConfirmation]=useState(false);
  const pendingRating=useRef<number|null>(null);
  const messagesPage=useRef(page);
  const polling=useRef<AbortController|null>(null);
  const messagePolling=useRef<AbortController|null>(null),messagesRequest=useRef<AbortController|null>(null),messagesVersion=useRef(0),manualMessages=useRef(false);
  const mutation=useRef<AbortController|null>(null),running=useRef(false),outcome=useRef<'confirm'|'cancel'|null>(null);
  const sent=useRef<{text:string;previousIds:string[]}|null>(null),selection=useRef({buildingId,floorId,poiKey});selection.current={buildingId,floorId,poiKey};
  const latest=useRef({detail,loading,action,ratingConfirmation,page,messagesLoading,messagesRefreshing});latest.current={detail,loading,action,ratingConfirmation,page,messagesLoading,messagesRefreshing};
  function cancelMessagePolling(){messagePolling.current?.abort();messagePolling.current=null;}
  function cancelPolling(){polling.current?.abort();polling.current=null;cancelMessagePolling();}
  function cancelMessageRefresh(){
    cancelMessagePolling();
    if(manualMessages.current||latest.current.messagesRefreshing){messagesRequest.current?.abort();messagesVersion.current++;manualMessages.current=false;setMessagesRefreshing(false);}
  }
  useEffect(()=>()=>{cancelPolling();},[contextKey,revision,detailRevision,busy,page]);
  useEffect(()=>()=>mutation.current?.abort(),[]);
  function report(reason:unknown,setMessage:(value:string)=>void) {
    if(reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();
    setMessage(reason instanceof AuthApiError?reason.serverMessage||'No se pudo completar la operación.':'No se pudo completar la operación.');
  }
  useEffect(()=>{
    const abort=new AbortController();
    if(detailContext.current!==contextKey){detailContext.current=contextKey;cancelPolling();cancelMessageRefresh();mutation.current?.abort();running.current=false;outcome.current=null;sent.current=null;pendingRating.current=null;setBusy(false);setOperation(null);setDetailRefreshing(false);setDetail(null);setError(null);setMessageError(null);setOptionsError(null);setMessages(null);setOptions(null);setPage(1);setBuildingId('');setFloorId('');setPoiKey('');setRatingScore(null);setRatingConfirmation(false);setAction(null);}
    if(busy)return;
    detailRead.current=true;setLoading(true);
    void loadPhysicalgoodsTransaction(target,abort.signal).then(result=>{if(!abort.signal.aborted){
      setDetail(result);setAccessDenied(false);
      if(result.rating&&pendingRating.current===result.rating.score){setError(null);pendingRating.current=null;setRatingScore(null);}
      if((outcome.current==='cancel'&&result.status==='CANCELADA')||(outcome.current==='confirm'&&result.confirmations.some(value=>value.userId===auth.identity?.userId&&value.role===result.role))){setError(null);outcome.current=null;}
    }}).catch(reason=>{if(!abort.signal.aborted){if(reason instanceof AuthApiError&&[401,403].includes(reason.status)){setAccessDenied(true);setDetail(null);setMessages(null);setOptions(null);}report(reason,setError);}}).finally(()=>{if(!abort.signal.aborted){detailRead.current=false;setLoading(false);setDetailRefreshing(false);setOperation(null);}});
    return()=>{abort.abort();detailRead.current=false;};
  },[contextKey,revision,detailRevision,busy]);
  useEffect(()=>{
    const abort=new AbortController();messagesRequest.current=abort;messagesVersion.current++;cancelMessagePolling();
    if(busy){setMessagesRefreshing(false);return;}
    const changed=messageContext.current!==contextKey||messagesPage.current!==page;messageContext.current=contextKey;messagesPage.current=page;
    const manual=manualMessages.current;manualMessages.current=false;
    if(changed)setMessages(null);
    if(manual){setMessagesRefreshing(true);}else{setMessagesLoading(changed||!messages);}
    void loadPhysicalgoodsCoordinationMessages(target,page,abort.signal).then(result=>{if(!abort.signal.aborted){
      setMessages(result);
      if(sent.current&&result.data.some(value=>value.senderId===auth.identity?.userId&&value.text===sent.current?.text&&!sent.current.previousIds.includes(value.id))){setMessageError(null);sent.current=null;}
    }}).catch(reason=>{if(!abort.signal.aborted)report(reason,setMessageError);}).finally(()=>{if(!abort.signal.aborted){setMessagesLoading(false);setMessagesRefreshing(false);}});
    return()=>abort.abort();
  },[contextKey,page,revision,busy,messagesRevision]);
  useEffect(()=>{
    const abort=new AbortController();
    if(!detail?.canCancel){setOptions(null);setOptionsLoading(false);return;}
    if(busy){setOptionsLoading(false);return;}
    if(optionsContext.current!==contextKey){optionsContext.current=contextKey;setOptions(null);}
    setOptionsLoading(true);setOptionsError(null);
    void loadPhysicalgoodsCoordinationOptions(target,abort.signal).then(result=>{if(!abort.signal.aborted){
      setOptions(result);
      const building=result.buildings.find(value=>value.id===selection.current.buildingId);
      if(!building)setBuildingId('');
      const floor=building?.floors.find(value=>value.id===selection.current.floorId);
      if(!floor)setFloorId('');
      if(!floor?.pois?.some(value=>value.id===selection.current.poiKey))setPoiKey('');
    }}).catch(reason=>{if(!abort.signal.aborted)report(reason,setOptionsError);}).finally(()=>{if(!abort.signal.aborted)setOptionsLoading(false);});
    return()=>abort.abort();
  },[detail?.canCancel,revision,busy,contextKey,optionsRevision]);
  const building=options?.buildings.find(value=>value.id===buildingId),floor=building?.floors.find(value=>value.id===floorId);
  const poi=floor?.pois?.find(value=>value.id===poiKey);
  const preview=building&&floor&&(!poiKey||poi)?`Estoy en ${building.name}, en ${floor.name}${poi?`, en ${poi.name}`:''}.`:null;
  async function poll({messages:includeMessages=true}:{messages?:boolean}={}){
    const current=latest.current;
    if(polling.current||running.current||current.loading||current.messagesRefreshing||manualMessages.current||current.action||current.ratingConfirmation||!current.detail||!['RESERVADA','PENDIENTE_CONFIRMACION'].includes(current.detail.status))return;
    const abort=new AbortController();polling.current=abort;const messageVersion=messagesVersion.current;
    try{
      const valid=()=>!abort.signal.aborted&&!running.current&&!latest.current.action&&!latest.current.ratingConfirmation;
      const failed=(reason:unknown)=>{if(valid()&&reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();};
      await Promise.allSettled([
        loadPhysicalgoodsTransaction(target,abort.signal).then(result=>{if(valid()&&JSON.stringify(result)!==JSON.stringify(latest.current.detail))setDetail(result);}).catch(reason=>{if(valid()&&reason instanceof AuthApiError&&[401,403].includes(reason.status)){setAccessDenied(true);setDetail(null);setMessages(null);setOptions(null);report(reason,setError);}else failed(reason);}),
        ...(includeMessages&&!current.messagesLoading&&!current.messagesRefreshing?[loadPhysicalgoodsCoordinationMessages(target,current.page,abort.signal).then(result=>{
          if(!valid()||latest.current.page!==current.page||messagesVersion.current!==messageVersion)return;
          setMessages(previous=>JSON.stringify(previous)===JSON.stringify(result)?previous:result);
          if(!sent.current||result.data.some(value=>value.senderId===auth.identity?.userId&&value.text===sent.current?.text&&!sent.current.previousIds.includes(value.id))){setMessageError(null);sent.current=null;}
        }).catch(failed)]:[]),
      ]);
    }catch(reason){if(!abort.signal.aborted&&reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();}
    finally{if(polling.current===abort)polling.current=null;}
  }
  /** Solo el hilo: conserva datos/selecciones y no enciende indicadores en la consulta periódica. */
  async function pollMessages(){
    const current=latest.current;
    if(messagePolling.current||running.current||current.loading||current.messagesLoading||current.messagesRefreshing||manualMessages.current||current.action||current.ratingConfirmation||!current.detail||!['RESERVADA','PENDIENTE_CONFIRMACION'].includes(current.detail.status))return;
    const abort=new AbortController(),version=messagesVersion.current;messagePolling.current=abort;
    try{
      const result=await loadPhysicalgoodsCoordinationMessages(target,current.page,abort.signal);
      if(abort.signal.aborted||version!==messagesVersion.current||latest.current.page!==current.page||running.current||latest.current.action||latest.current.ratingConfirmation)return;
      setMessages(previous=>JSON.stringify(previous)===JSON.stringify(result)?previous:result);
      if(!sent.current||result.data.some(value=>value.senderId===auth.identity?.userId&&value.text===sent.current?.text&&!sent.current.previousIds.includes(value.id))){setMessageError(null);sent.current=null;}
    }catch(reason){if(!abort.signal.aborted&&reason instanceof AuthApiError&&[401,403].includes(reason.status))void auth.refreshIdentity();}
    finally{if(messagePolling.current===abort)messagePolling.current=null;}
  }
  function refreshMessages(){
    const current=latest.current;
    if(running.current||manualMessages.current||current.loading||current.messagesLoading||current.messagesRefreshing||current.action||current.ratingConfirmation||!current.detail)return;
    cancelPolling();messagesRequest.current?.abort();messagesVersion.current++;manualMessages.current=true;
    setMessageError(null);setMessagesRefreshing(true);setPage(1);setMessagesRevision(value=>value+1);
  }
  function refreshDetail(){
    const current=latest.current;
    if(running.current||detailRead.current||current.loading||current.action||current.ratingConfirmation)return;
    cancelPolling();detailRead.current=true;setLoading(true);setDetailRefreshing(true);setError(null);setDetailRevision(value=>value+1);
  }
  async function perform(kind:'confirm'|'cancel'|'message'|'rating',explicitSubmit=false) {
    if(running.current||detailRead.current||loading||error||!detail||(kind==='confirm'&&(!detail.canConfirm||(!explicitSubmit&&action!=='confirm')))||(kind==='cancel'&&(!detail.canCancel||action!=='cancel'))||(kind==='message'&&(!detail.canCancel||!preview||optionsLoading||optionsError))
      ||(kind==='rating'&&(detail.status!=='COMPLETADA'||detail.role!=='RECEPTOR'||Boolean(detail.rating)||!detail.canRate||(!explicitSubmit&&!ratingConfirmation)||ratingScore===null||!Number.isInteger(ratingScore)||ratingScore<1||ratingScore>5)))return;
    const abort=new AbortController();mutation.current=abort;running.current=true;setBusy(true);setOperation(kind);setAction(null);
    cancelPolling();cancelMessageRefresh();
    setRatingConfirmation(false);
    if(kind==='message'){setMessageError(null);sent.current=null;}
    else if(kind==='rating'){setError(null);pendingRating.current=ratingScore;}
    else{setError(null);outcome.current=kind;}
    try {
      if(kind==='message'){
        // La página visible puede ser antigua; compara contra el historial más reciente antes de enviar.
        const before=await loadPhysicalgoodsCoordinationMessages(target,1,abort.signal);
        if(abort.signal.aborted)return;
        sent.current={text:preview!,previousIds:before.data.map(value=>value.id)};
        if(poiKey)await sendPhysicalgoodsCoordination(target,buildingId,floorId,abort.signal,poiKey);
        else await sendPhysicalgoodsCoordination(target,buildingId,floorId,abort.signal);
      }
      else if(kind==='rating')await ratePhysicalgoodsOwner(target,ratingScore!,abort.signal);
      else await changePhysicalgoodsTransaction(target,kind,abort.signal);
    }catch(reason){if(!abort.signal.aborted){report(reason,kind==='message'?setMessageError:setError);}}
    finally{if(!abort.signal.aborted){detailRead.current=true;setLoading(true);running.current=false;setBusy(false);setPage(1);setRevision(value=>value+1);if(kind!=='message')onChanged();}}
  }
  return {detail,accessDenied,historical:!!detail&&detail.campus.id!==auth.identity?.campusId,messages,options,buildingId,floorId,poiKey,building,floor,poi,preview,loading,detailRefreshing,messagesLoading,messagesRefreshing,optionsLoading,busy,error,messageError,optionsError,page,action,operation,
    cancelPolling,cancelMessagePolling,cancelMessageRefresh,poll,pollMessages,refreshMessages,refreshDetail,ratingScore,ratingConfirmation,rate:()=>perform('rating'),
    selectRating:(value:number)=>{if(!running.current&&detail?.canRate&&Number.isInteger(value)&&value>=1&&value<=5){setRatingScore(value);setRatingConfirmation(false);}},
    confirmRating:()=>{if(!running.current&&detail?.canRate&&ratingScore!==null)setRatingConfirmation(true);},
    cancelRating:()=>{if(!running.current)setRatingConfirmation(false);},
    selectAction:(value:'confirm'|'cancel')=>{if(!running.current&&!detailRead.current&&!loading&&!error&&detail&&(value==='confirm'?detail.canConfirm:detail.canCancel))setAction(value);},cancelAction:()=>{if(!running.current)setAction(null);},
    confirm:()=>perform('confirm'),confirmExchange:()=>perform('confirm',true),submitRating:()=>perform('rating',true),cancel:()=>perform('cancel'),send:()=>perform('message'),
    setBuilding:(value:string)=>{if(!running.current&&value!==selection.current.buildingId){setBuildingId(value);setFloorId('');setPoiKey('');}},
    setFloor:(value:string)=>{if(!running.current&&value!==selection.current.floorId){setFloorId(value);setPoiKey('');}},setPoi:(value:string)=>{if(!running.current)setPoiKey(value);},
    setPage:(value:number)=>{if(!running.current&&!messagesLoading&&!messagesRefreshing){cancelMessagePolling();setMessageError(null);setPage(Math.max(1,value));}},
    reloadOptions:()=>{if(!running.current)setOptionsRevision(value=>value+1);},
    reloadMessages:()=>{if(!running.current){setMessageError(null);setMessagesRevision(value=>value+1);}},
    reload:()=>{if(!running.current){cancelPolling();detailRead.current=true;setLoading(true);setError(null);setMessageError(null);setAction(null);setRatingConfirmation(false);setRevision(value=>value+1);}}};
}
