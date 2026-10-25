import {useState} from 'react';
import {Text,View} from 'react-native';
import {SentRequestCard,SentRequestsSkeleton} from '../../components/SentRequestCard';
import {RequestButton,requestUI} from '../../components/RequestsUI';
import {detailUI} from '../../components/ResourceDetailUI';
import type {usePhysicalgoodsRequests} from '../hooks/usePhysicalgoodsRequests';
import {sentRequestPresentation} from '../utils/sentRequestPresentation';
import {PhysicalgoodsRequestProduct} from './PhysicalgoodsRequestProduct';
import {PhysicalgoodsRequestPrices} from './PhysicalgoodsPriceHistory';
import type {PhysicalgoodsReceivedRequest} from '../types/publication';

export function PhysicalgoodsSentRequests({state}:{
  state:ReturnType<typeof usePhysicalgoodsRequests>;
}){
  const rows=state.page?.data??[];
  const key=`${rows[0]?.requester.id??''}:${state.number}`;
  const [selection,setSelection]=useState<{key:string;id:string|null}|null>(null);
  const selected=selection?.key===key&&rows.some(row=>row.id===selection.id)?selection.id:null;
  const [resource,setResource]=useState<PhysicalgoodsReceivedRequest|null>(null);
  const disabled=state.busy||Boolean(state.selection);
  return <>{state.loading?<SentRequestsSkeleton expanded={Boolean(selection?.id)}/>:<View style={requestUI.cards}>{rows.map(request=>{
    return <SentRequestCard key={request.id} title={request.publication.title} ownerName={request.owner.fullName} campus={request.campus.name}
      requestedAt={request.requestedAt} message={request.message} {...sentRequestPresentation(request)}
      amountContent={<PhysicalgoodsRequestPrices request={request} showSelected/>} collapsedPriceContent={<PhysicalgoodsRequestPrices request={request} showSelected compact/>}
      expanded={selected===request.id} disabled={disabled} onToggle={()=>setSelection({key,id:selected===request.id?null:request.id})}>
      {request.publication.isWithdrawn&&<Text style={detailUI.helper}>Publicación retirada. Conservas tu solicitud.</Text>}
      {!request.publication.canView&&<Text style={detailUI.helper}>Consulta histórica: las fotografías actuales pueden no estar disponibles.</Text>}
      <RequestButton primary label="Ver recurso" accessibilityLabel={`Ver recurso: ${request.publication.title}`} disabled={disabled} onPress={()=>setResource(request)}/>
    </SentRequestCard>;
  })}</View>}{resource&&<PhysicalgoodsRequestProduct key={resource.id} request={resource} onClose={()=>setResource(null)}/>}</>;
}
