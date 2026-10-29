import {useEffect,useRef,useState} from 'react';
import {Text,View} from 'react-native';
import {RequestSegments,RequestButton,RequestDecisionDialog} from '../../components/RequestsUI';
import {RequestAccordionCard,RequestAccordionSkeleton,RequestMessage,requestAccordionUI as styles} from '../../components/RequestAccordionCard';
import {ResourceRequestsModal,ResourceRequestsRow} from '../../components/ResourceRequestsModal';
import {useMarketplaceRefresh} from '../../hooks/useMarketplaceRefresh';
import {useDigitalActivityPage} from '../hooks/useDigitalActivity';
import type {DigitalActivityCounts,DigitalActivityRequest,DigitalActivityResource} from '../types/activity';
import {resolveDigitalRequest} from '../api/digitalTradesApi';
import {loadDigitalActivityPage} from '../api/digitalActivityApi';
import {DigitalResourceModal} from './DigitalActivityResource';
import {DigitalActivityFeedback,DigitalActivityPager,digitalAmount,digitalRequestPresentation} from './DigitalActivityUI';

export function DigitalActivityRequests({active,counts,countsLoading,onChanged,initialReceived=false,entryVersion=0}:{active:boolean;counts:DigitalActivityCounts|null;countsLoading:boolean;onChanged:()=>void;initialReceived?:boolean;entryVersion?:number}){
 const [received,setReceived]=useState(initialReceived);
 useEffect(()=>{if(entryVersion>0)setReceived(true);},[entryVersion]);
 return <View style={{gap:16}}><RequestSegments received={received} onChange={setReceived} pendingCount={counts?.receivedPending} acceptedCount={counts?.sentAccepted} countsLoading={countsLoading} showPendingSummary={false} pendingCountLabel="pendientes"/>
 <View style={!received?undefined:{display:'none'}}><DigitalSentRequests active={active&&!received}/></View>
 <View style={received?undefined:{display:'none'}}><DigitalReceivedResources active={active&&received} onChanged={onChanged}/></View></View>;
}
function DigitalSentRequests({active}:{active:boolean}){
 const [page,setPage]=useState(1),[expanded,setExpanded]=useState<string|null>(null),[resource,setResource]=useState<string|null>(null);
 const state=useDigitalActivityPage<DigitalActivityRequest>('requests',`received=false&page=${page}&limit=10`,active);
 useMarketplaceRefresh(state.reload,state.loading,!resource&&!state.loading,'mis solicitudes enviadas',active);
 return <View style={{gap:14}}>{state.initialLoading?<RequestAccordionSkeleton/>:<><DigitalActivityFeedback error={state.error} empty={!state.value?.data.length} onRetry={state.reload}/>
 {state.value?.data.map(row=>{const status=digitalRequestPresentation(row),open=expanded===row.id;return <RequestAccordionCard key={row.id} title={row.title} initialName={row.ownerName} subtitle={open?row.campusName:`${status.label} · ${new Date(row.requestedAt).toLocaleDateString('es-CL',{day:'numeric',month:'short'})}`}
 trailing={open?new Date(row.requestedAt).toLocaleDateString('es-CL',{day:'numeric',month:'short'}):digitalAmount(row)} expanded={open} onToggle={()=>setExpanded(open?null:row.id)} tone={status.tone}>
 <View style={styles.amountRow}><Text style={styles.amountLabel}>Monto acordado</Text><Text style={styles.amount}>{digitalAmount(row)}</Text></View>
 <RequestMessage message={row.message} caption={`Tú, mensaje enviado el ${new Date(row.requestedAt).toLocaleString('es-CL')}`} status={status.label} tone={status.tone}/>
 <RequestButton label="Ver recurso" onPress={()=>setResource(row.publicationId)} primary/></RequestAccordionCard>;})}
 <DigitalActivityPager meta={state.value?.meta} onChange={value=>{setPage(value);setExpanded(null);}} disabled={state.loading}/></>}
 {resource&&<DigitalResourceModal id={resource} title="Recurso de la solicitud" onClose={()=>setResource(null)}/>}</View>;
}
function DigitalReceivedResources({active,onChanged}:{active:boolean;onChanged:()=>void}){
 const [page,setPage]=useState(1),[resource,setResource]=useState<DigitalActivityResource|null>(null);
 const state=useDigitalActivityPage<DigitalActivityResource>('resources',`page=${page}&limit=10`,active);
 const refresh=()=>{state.reload();onChanged();};
 useMarketplaceRefresh(refresh,state.loading,!resource&&!state.loading,'mis solicitudes recibidas',active);
 function resolved(decision:'ACEPTAR'|'RECHAZAR'){
  if(resource)state.update(value=>({...value,data:value.data.map(row=>row.publicationId===resource.publicationId?{...row,pending:Math.max(0,row.pending-1),active:row.active+(decision==='ACEPTAR'?1:0)}:row)}));
  onChanged();
 }
 return <View style={{gap:14}}>{state.initialLoading?<RequestAccordionSkeleton/>:<><DigitalActivityFeedback error={state.error} empty={!state.value?.data.length} onRetry={refresh}/>
 {state.value?.data.map(row=><ResourceRequestsRow digital key={row.publicationId} title={row.title} summary={`${digitalAmount(row)} · ${row.campusName}`} count={row.total}
 statusLabel={row.active?`${row.active} transacción${row.active===1?'':'es'} pendiente${row.active===1?'':'s'}`:row.pending?`${row.pending} solicitud${row.pending===1?'':'es'} por responder`:row.completed?`${row.completed} transacción${row.completed===1?'':'es'} finalizada${row.completed===1?'':'s'}`:'Sin solicitudes pendientes'} onPress={()=>setResource(row)}/>)}
 <DigitalActivityPager meta={state.value?.meta} onChange={setPage} disabled={state.loading}/></>}
 {resource&&<DigitalReceivedRequests key={resource.publicationId} resource={resource} onClose={()=>setResource(null)} onResolved={resolved} onUncertain={()=>{state.reload();onChanged();}}/>}</View>;
}
export function DigitalReceivedRequests({resource,onClose,onResolved,onUncertain}:{resource:DigitalActivityResource;onClose:()=>void;onResolved:(decision:'ACEPTAR'|'RECHAZAR')=>void;onUncertain:()=>void}){
 const [page,setPage]=useState(1),[order,setOrder]=useState<'oldest'|'newest'>('oldest'),[selection,setSelection]=useState<{request:DigitalActivityRequest;decision:'ACEPTAR'|'RECHAZAR'}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),running=useRef(false),pending=useRef<AbortController|null>(null);
 const query=`received=true&resourceId=${resource.publicationId}&page=${page}&limit=10&order=${order}`;
 const state=useDigitalActivityPage<DigitalActivityRequest>('requests',query);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function resolve(){if(!selection||running.current||state.loading||state.error)return;running.current=true;setBusy(true);setError(null);
 const abort=new AbortController();pending.current=abort;const chosen=selection;setSelection(null);
 try{await resolveDigitalRequest(chosen.request,chosen.decision,abort.signal);const fresh=await loadDigitalActivityPage<DigitalActivityRequest>('requests',query,abort.signal);
 if(!abort.signal.aborted){state.update(()=>fresh);onResolved(chosen.decision);}}
 catch{if(!abort.signal.aborted){setError('No se pudo confirmar el resultado. Actualiza las solicitudes antes de reintentar.');state.reload();onUncertain();}}
 finally{running.current=false;if(!abort.signal.aborted)setBusy(false);}}
 return <ResourceRequestsModal digital title={resource.title} summary={`${digitalAmount(resource)} · ${resource.campusName}`} requests={(state.value?.data??[]).map(row=>({id:row.id,name:row.requesterName,careers:row.careers,averageRating:row.averageRating,ratingCount:row.ratingCount,message:row.message,requestedAt:row.requestedAt,status:digitalRequestPresentation(row).label,tone:digitalRequestPresentation(row).tone,
 canAccept:row.canAccept&&!state.loading&&!error,canReject:row.canResolve&&!state.loading&&!error,onAccept:()=>setSelection({request:row,decision:'ACEPTAR'}),onReject:()=>setSelection({request:row,decision:'RECHAZAR'})}))}
 loading={state.initialLoading} error={error??state.error} blocked={busy} feedback={busy?'Guardando decisión…':null} onClose={onClose} onRefresh={()=>{setError(null);state.reload();}}
 pagination={{page,total:state.value?.meta.total??resource.total,order,onPageChange:setPage,onOrderChange:value=>{setOrder(value);setPage(1);}}}
 notice="Cada persona tiene su propia transacción. El recurso sigue disponible para otros estudiantes."
 overlay={selection?<RequestDecisionDialog embedded selection={{name:selection.request.requesterName,title:resource.title,decision:selection.decision}} disabled={busy} onConfirm={()=>void resolve()} onCancel={()=>setSelection(null)}/>:undefined}/>;
}
