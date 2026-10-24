import {useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {RequestAccordionCard,RequestAccordionSkeleton,RequestMessage,requestAccordionUI,type RequestTone} from '../../components/RequestAccordionCard';
import {RequestButton,requestUI} from '../../components/RequestsUI';
import {CATALOG_COLORS as colors} from '../../components/CatalogUI';
import {detailUI} from '../../components/ResourceDetailUI';
import type {usePhysicalgoodsRequests} from '../hooks/usePhysicalgoodsRequests';
import type {PhysicalgoodsReceivedRequest} from '../types/publication';
import {PhysicalgoodsRequestProduct} from './PhysicalgoodsRequestProduct';

export function groupReceivedRequests(rows:PhysicalgoodsReceivedRequest[]){
  const groups=new Map<string,PhysicalgoodsReceivedRequest[]>();
  for(const row of rows){const group=groups.get(row.publication.id);if(group)group.push(row);else groups.set(row.publication.id,[row]);}
  return [...groups.values()];
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
  const groups=groupReceivedRequests(state.page?.data??[]),key=`${groups[0]?.[0].owner.id??''}:${state.number}`;
  const [selection,setSelection]=useState<{key:string;id:string|null}|null>(null);
  const [resource,setResource]=useState<PhysicalgoodsReceivedRequest|null>(null);
  const selected=selection?.key===key?selection.id:null;
  const disabled=state.busy||Boolean(state.selection);
  return <>{state.loading?<RequestAccordionSkeleton label="Cargando solicitudes recibidas" expanded={Boolean(selection?.id)}/>:<View style={requestUI.cards}>{groups.map(rows=>{
    const first=rows[0],publication=first.publication,pending=rows.filter(row=>row.status==='PENDIENTE').length;
    const expanded=selected===publication.id;
    const amount=publication.modality==='DONACION'?'Donación':publication.price===null?'Precio no disponible':`$${publication.price.toLocaleString('es-CL')}`;
    const count=`${rows.length} solicitud${rows.length===1?'':'es'} · ${pending} pendiente${pending===1?'':'s'}`;
    return <RequestAccordionCard key={publication.id} title={publication.title} initialName={publication.title} subtitle={count} trailing={amount} expanded={expanded}
      label={`solicitudes del recurso: ${publication.title}`} tone={pending?'pending':'accepted'} disabled={disabled}
      onToggle={()=>setSelection({key,id:expanded?null:publication.id})}>
      <View style={requestAccordionUI.amountRow}><Text style={requestAccordionUI.amountLabel}>{publication.modality==='DONACION'?'Modalidad':'Precio publicado'}</Text><Text style={requestAccordionUI.amount}>{amount}</Text></View>
      <Text style={detailUI.helper}>{first.campus.name}{publication.isWithdrawn?' · Publicación retirada':''}</Text>
      <RequestButton primary label="Ver recurso" accessibilityLabel={`Ver recurso: ${publication.title}`} onPress={()=>setResource(first)} disabled={disabled}/>
      {publication.status==='RESERVADO'&&pending>0&&<Text style={detailUI.helper}>El recurso está reservado. Las demás solicitudes esperan; podrás aceptarlas si se cancela la transacción.</Text>}
      {rows.map(row=><View key={row.id} style={styles.request}>
        <View style={styles.person}><View accessible={false} aria-hidden style={styles.avatar}><Text style={styles.initial}>{row.requester.fullName.trim().charAt(0).toLocaleUpperCase('es-CL')||'?'}</Text></View><Text style={styles.name}>{row.requester.fullName}</Text></View>
        <RequestMessage message={row.message} caption={`Mensaje recibido el ${new Date(row.requestedAt).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit'})}`} {...receivedStatus(row)}/>
        {row.canResolve&&row.status==='PENDIENTE'&&<View style={requestUI.inline}>
          <View style={{flex:1,minWidth:100}}><RequestButton label="Rechazar" accessibilityLabel={`Rechazar solicitud de ${row.requester.fullName}`} onPress={()=>state.select(row,'RECHAZAR')} disabled={disabled} busy={state.busy&&state.saving?.id===row.id&&state.saving.decision==='RECHAZAR'}/></View>
          <View style={{flex:1.4,minWidth:110}}><RequestButton primary label="Aceptar" accessibilityLabel={`Aceptar solicitud de ${row.requester.fullName}`} onPress={()=>state.select(row,'ACEPTAR')} disabled={disabled||publication.status!=='DISPONIBLE'} busy={state.busy&&state.saving?.id===row.id&&state.saving.decision==='ACEPTAR'}/></View>
        </View>}
        <View style={styles.links}><RequestButton variant="text" label="Ver solicitud" accessibilityLabel={`Ver solicitud de ${row.requester.fullName}: ${publication.title}`} onPress={()=>onDetail(publication.id,row.id)} disabled={disabled}/>
          {row.transaction&&<RequestButton variant="text" label="Ver transacción" onPress={()=>onAgreement(publication.id,row.transaction!.id)} disabled={disabled}/>}</View>
      </View>)}
    </RequestAccordionCard>;
  })}</View>}{resource&&<PhysicalgoodsRequestProduct request={resource} viewerRole="PROPIETARIO" grouped onClose={()=>setResource(null)}/>}</>;
}

const styles=StyleSheet.create({
  request:{borderTopWidth:1,borderColor:colors.border,paddingTop:16,gap:10},person:{flexDirection:'row',alignItems:'center',gap:10},
  avatar:{width:32,height:32,borderRadius:16,backgroundColor:colors.tint,alignItems:'center',justifyContent:'center'},initial:{color:colors.primary,fontSize:13,fontWeight:'700'},
  name:{flex:1,color:colors.primary,fontSize:15,lineHeight:21,fontWeight:'700'},links:{flexDirection:'row',flexWrap:'wrap',gap:12},
});
