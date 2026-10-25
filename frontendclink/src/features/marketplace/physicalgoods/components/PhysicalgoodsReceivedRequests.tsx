import {useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import {RequestAccordionSkeleton,type RequestTone} from '../../components/RequestAccordionCard';
import {RequestDecisionDialog,requestUI} from '../../components/RequestsUI';
import {ResourceRequestsModal,ResourceRequestsRow} from '../../components/ResourceRequestsModal';
import {usePhysicalgoodsRequests} from '../hooks/usePhysicalgoodsRequests';
import type {PhysicalgoodsReceivedRequest} from '../types/publication';
import {compareReceivedResources,receivedTransactionLabel} from '../utils/receivedRequestIndicators';

export function groupReceivedRequests(rows:PhysicalgoodsReceivedRequest[]){
  const groups=new Map<string,PhysicalgoodsReceivedRequest[]>();
  for(const row of rows){const group=groups.get(row.publication.id);if(group)group.push(row);else groups.set(row.publication.id,[row]);}
  return [...groups.values()].sort(compareReceivedResources);
}
function receivedStatus(row:PhysicalgoodsReceivedRequest):{tone:RequestTone;status:string}{
  if(row.transaction?.status==='COMPLETADA')return {tone:'completed',status:'El intercambio se completó.'};
  if(row.transaction?.status==='CANCELADA')return {tone:'closed',status:'Transacción cancelada'};
  if(row.status==='ACEPTADA')return {tone:'accepted',status:'Solicitud aceptada'};
  if(row.status==='RECHAZADA')return {tone:'rejected',status:'Solicitud rechazada'};
  if(row.status==='CANCELADA')return {tone:'closed',status:'Solicitud cerrada'};
  return {tone:'pending',status:row.publication.status==='RESERVADO'?'Pendiente mientras se realiza otro intercambio.':'Esperando tu respuesta'};
}

export function PhysicalgoodsReceivedRequests({state,onDetail,onAgreement}:{state:ReturnType<typeof usePhysicalgoodsRequests>;
  onDetail:(publicationId:string,requestId:string)=>void;onAgreement:(publicationId:string,transactionId:string)=>void;
}){
  const groups=groupReceivedRequests(state.page?.data??[]),scope=state.scope??'';
  const [opened,setOpened]=useState<{id:string;page:number;scope:string;rows:PhysicalgoodsReceivedRequest[]}|null>(null);
  useEffect(()=>setOpened(null),[scope,state.number]);
  const current=opened?.page===state.number&&opened.scope===scope?opened:null;
  const disabled=state.busy||state.loading||Boolean(state.selection);
  const price=(row:PhysicalgoodsReceivedRequest)=>row.publication.modality==='DONACION'?'Donación':row.publication.price===null?'Precio no disponible':`$${row.publication.price.toLocaleString('es-CL')}`;
  return <>{state.loading?<RequestAccordionSkeleton label="Cargando solicitudes recibidas"/>:<View style={requestUI.cards}>{groups.map(group=>{
    const first=group[0],publication=first.publication;
    return <ResourceRequestsRow key={publication.id} title={publication.title} summary={`${price(first)} · ${first.campus.name}`} count={group.length} statusLabel={receivedTransactionLabel(group)} disabled={disabled}
      onPress={()=>setOpened({id:publication.id,page:state.number,scope,rows:group})}/>;
  })}</View>}{current&&<PhysicalgoodsReceivedResource key={`${scope}:${current.id}`} initialRows={current.rows} onClose={()=>setOpened(null)} onChanged={()=>state.changed?.()} onRowsChanged={state.receiveResourceRows} onDetail={onDetail} onAgreement={onAgreement}/>}</>;
}

/** Lectura/decisión independiente del recurso: no depende de su posición en el listado exterior. */
export function PhysicalgoodsReceivedResource({initialRows,onClose,onChanged,onRowsChanged,onDetail,onAgreement}:{initialRows:PhysicalgoodsReceivedRequest[];onClose:()=>void;onChanged:()=>void;onRowsChanged?:(publicationId:string,rows:PhysicalgoodsReceivedRequest[])=>void;onDetail:(publicationId:string,requestId:string)=>void;onAgreement:(publicationId:string,transactionId:string)=>void}){
  const state=usePhysicalgoodsRequests(true,onChanged,true,0,initialRows[0].publication.id);
  const cache=useRef(initialRows),publicationId=initialRows[0].publication.id;
  if(state.page)cache.current=state.page.data.filter(row=>row.publication.id===publicationId);
  const rows=state.page?cache.current:state.loading||state.error?cache.current:[],resource=rows[0]??cache.current[0]??initialRows[0];
  useEffect(()=>{if(state.page&&!state.loading&&!state.busy&&!state.error)onRowsChanged?.(publicationId,state.page.data.filter(row=>row.publication.id===publicationId));},[state.page,state.loading,state.busy,state.error,publicationId,onRowsChanged]);
  const price=(row:PhysicalgoodsReceivedRequest)=>row.publication.modality==='DONACION'?'Donación':row.publication.price===null?'Precio no disponible':`$${row.publication.price.toLocaleString('es-CL')}`;
  const disabled=state.busy||state.loading||Boolean(state.selection);
  const close=()=>{if(state.busy)return;if(state.selection)state.cancel();else onClose();};
  const leave=(action:()=>void)=>{if(!disabled){onClose();action();}};
  const decision=state.selection?<RequestDecisionDialog embedded physical selection={{name:state.selection.request.requester.fullName,title:state.selection.request.publication.title,decision:state.selection.decision}}
    disabled={state.busy||state.loading} onConfirm={()=>{void state.resolve();}} onCancel={state.cancel}/>:undefined;
  return <ResourceRequestsModal title={resource.publication.title}
    summary={`${price(rows[0]??resource)} · ${resource.campus.name}`} loading={state.loading} error={state.error} feedback={state.busy?'Guardando decisión…':state.feedback}
    blocked={state.busy} onRefresh={state.reload} onClose={close} overlay={decision}
    notice={(rows[0]??resource).publication.isWithdrawn?'Publicación retirada. Conservas las solicitudes en tu historial.':(rows[0]??resource).publication.status==='RESERVADO'?'El recurso está reservado. Las demás solicitudes siguen pendientes.':undefined}
    requests={rows.map(row=>({id:row.id,name:row.requester.fullName,careers:row.requester.careers,message:row.message,requestedAt:row.requestedAt,...receivedStatus(row),
      canReject:row.canResolve&&row.status==='PENDIENTE',canAccept:row.canResolve&&row.status==='PENDIENTE'&&row.publication.status==='DISPONIBLE',
      onAccept:()=>state.select(row,'ACEPTAR'),onReject:()=>state.select(row,'RECHAZAR'),
      onDetails:row.status==='ACEPTADA'||row.transaction?.status==='COMPLETADA'?undefined:()=>leave(()=>onDetail(row.publication.id,row.id)),
      onTransaction:row.status!=='ACEPTADA'&&row.transaction&&row.transaction.status!=='COMPLETADA'?()=>leave(()=>onAgreement(row.publication.id,row.transaction!.id)):undefined,
    }))}/>;
}
