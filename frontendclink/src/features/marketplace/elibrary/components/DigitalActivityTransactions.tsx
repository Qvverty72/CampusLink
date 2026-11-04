import {useState} from 'react';
import {Text,View} from 'react-native';
import {AgreementCard,AgreementCardsSkeleton,AgreementMenu,AgreementPanelSkeleton,AgreementTabs,AgreementListSection,type AgreementStep} from '../../components/AgreementUI';
import {AgreementStepModal} from '../../components/AgreementStepModal';
import {ui} from '../../components/CatalogUI';
import {RequestButton} from '../../components/RequestsUI';
import {TransactionConfirmations} from '../../components/TransactionUI';
import {AgreementNotice,detailUI} from '../../components/ResourceDetailUI';
import {PersonalEmpty} from '../../components/PersonalUI';
import {OwnerRating} from '../../components/OwnerRating';
import {MarketplaceReportForm} from '../../components/MarketplaceReportForm';
import {useMarketplaceRefresh} from '../../hooks/useMarketplaceRefresh';
import {useAgreementPolling} from '../../hooks/useAgreementPolling';
import {useDigitalActivityPage} from '../hooks/useDigitalActivity';
import {useDigitalTransactionPanel} from '../hooks/useDigitalTransactionPanel';
import type {DigitalTrade} from '../types/trade';
import {DigitalResourceContent} from './DigitalActivityResource';
import {DigitalActivityPager} from './DigitalActivityUI';
import {digitalTransactionPresentation} from '../utils/digitalTransactionPresentation';
import {agreementCopy as copy} from '../../utils/agreementPresentation';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {DigitalTransactionChat} from './DigitalTransactionChat';

type Panel=AgreementStep|'menu'|'cancel'|'report';
export function DigitalActivityTransactions({active,onChanged,onAcquired,onExplore}:{active:boolean;onChanged:()=>void;onAcquired:(id:string)=>void;onExplore?:()=>void}){
 const {identity}=useAuth(),[tab,setTab]=useState<'active'|'finished'>('active'),[page,setPage]=useState(1),[selected,setSelected]=useState<{trade:DigitalTrade;panel:Panel}|null>(null);
 const state=useDigitalActivityPage<DigitalTrade>('transactions',`tab=${tab}&page=${page}&limit=5`,active);
 const refresh=()=>{state.reload();onChanged();};
 useMarketplaceRefresh(refresh,state.loading,!selected&&!state.loading,'mis transacciones digitales',active);
 function snapshot(trade:DigitalTrade){
  const previous=state.value?.data.find(row=>row.id===trade.id);
  const changed=previous&&(previous.status!==trade.status||previous.rating?.id!==trade.rating?.id);
  state.update(value=>{const old=value.data.find(row=>row.id===trade.id);if(!old)return value;
   const crossed=['RESERVADA','PENDIENTE_CONFIRMACION'].includes(old.status)!==['RESERVADA','PENDIENTE_CONFIRMACION'].includes(trade.status);
   return {...value,data:crossed?value.data.filter(row=>row.id!==trade.id):value.data.map(row=>row.id===trade.id?trade:row),meta:{...value.meta,total:crossed?Math.max(0,(value.meta.total??1)-1):value.meta.total,counts:crossed&&value.meta.counts?{active:Math.max(0,value.meta.counts.active-1),finished:value.meta.counts.finished+1}:value.meta.counts}};});
  if(changed)onChanged();
 }
 const counts=state.value?.meta.counts;
 const items=(state.value?.data??[]).map(trade=>({trade,view:digitalTransactionPresentation(trade,identity?.userId)}));
 const groups=tab==='finished'?[{label:'',items:items.filter(item=>item.view.group==='finished').sort((a,b)=>Date.parse(b.trade.completedAt??b.trade.cancelledAt??b.trade.startedAt)-Date.parse(a.trade.completedAt??a.trade.cancelledAt??a.trade.startedAt))}]:[
  {label:copy.actionGroup,items:items.filter(item=>item.view.group==='action')},
  {label:copy.waitingGroup,items:items.filter(item=>item.view.group==='waiting')},
  {label:copy.otherGroup,items:items.filter(item=>item.view.group==='other')},
 ];
 return <AgreementListSection><AgreementTabs selected={tab} onSelect={value=>{setTab(value);setPage(1);}} counts={counts} showCounts={!state.initialLoading&&!state.error} disabled={Boolean(selected)}/>
 {state.error&&<View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{state.error}</Text><RequestButton label={copy.retry} onPress={refresh}/></View>}
 {state.initialLoading?<AgreementCardsSkeleton digital/>:<>
 {!items.length&&!state.error&&<PersonalEmpty title={tab==='active'?copy.emptyActive:copy.emptyFinished} helper={copy.emptyHelp} action={onExplore?copy.explore:copy.retry} onAction={onExplore??refresh}/>}
 {groups.filter(group=>group.items.length).map(group=><AgreementListSection key={group.label} label={group.label}>
 {group.items.map(({trade,view})=><AgreementCard key={trade.id} digital digitalChat title={trade.title} roleLabel={trade.ownerId===identity?.userId?'Propietario':'Receptor'} participants={trade.participants} currentUserId={identity?.userId}
 modality={trade.modality} amount={trade.amount} currency={trade.currency} state={view.state} label={view.label} ratingScore={trade.rating?.score} disabled={Boolean(selected)}
 dateLabel={`${trade.completedAt||trade.cancelledAt?'Cerrado':'Iniciado'} el ${new Date(trade.completedAt??trade.cancelledAt??trade.startedAt).toLocaleDateString('es-CL')}`}
 onSelect={panel=>setSelected({trade,panel})} onMenu={()=>setSelected({trade,panel:'menu'})}/>)}</AgreementListSection>)}
 {!state.error&&<DigitalActivityPager meta={state.value?.meta} onChange={setPage} threshold={5} disabled={state.loading||Boolean(selected)} label={`Paginación de transacciones ${tab==='active'?'activas':'finalizadas'}`}/>}</>}
 {selected&&active&&<DigitalTransactionModal key={selected.trade.id} initial={selected.trade} initialPanel={selected.panel} active={active} onClose={()=>setSelected(null)} onSnapshot={snapshot} onAcquired={id=>{setSelected(null);onAcquired(id);}}/>}
 </AgreementListSection>;
}
export function DigitalTransactionModal({initial,initialPanel,onClose,onSnapshot,onAcquired,active=true}:{initial:DigitalTrade;initialPanel:Panel;onClose:()=>void;onSnapshot:(trade:DigitalTrade)=>void;onAcquired:(id:string)=>void;active?:boolean}){
 const state=useDigitalTransactionPanel(initial,onSnapshot),[panel,setPanel]=useState<Panel>(initialPanel),[score,setScore]=useState<number|null>(null),[reportBusy,setReportBusy]=useState(false);
 const trade=state.trade,locked=state.busy||reportBusy,disabled=locked||state.loading||!state.fresh||Boolean(state.error);
 const participants=trade.participants??[{id:trade.ownerId,name:'Propietario',role:'PROPIETARIO'},{id:trade.receiverId,name:'Receptor',role:'RECEPTOR'}];
 const rating=panel==='confirm'&&trade.status==='COMPLETADA'&&trade.canRate&&!trade.rating;
 const title=panel==='accepted'?'Recurso de la transacción':panel==='menu'?'Opciones de transacción':panel==='report'?'Denunciar transacción':panel==='cancel'?'Cancelar transacción':rating?'Valorar transacción':'Confirmar';
 useAgreementPolling(state.read,active&&panel==='confirm'&&state.fresh&&!state.loading&&!locked&&!state.error&&['RESERVADA','PENDIENTE_CONFIRMACION'].includes(trade.status),7000);
 if(panel==='coordinate')return <DigitalTransactionChat key={trade.id} initial={trade} active={active} onClose={onClose} onSnapshot={onSnapshot}/>;
 return <AgreementStepModal title={title} closeLabel="Cerrar transacción" onClose={onClose} closeDisabled={locked} fillHeight={panel==='accepted'||panel==='report'} preferredHeight={panel==='menu'||panel==='cancel'?420:680}
 contentKey={panel} refresh={{onRefresh:state.read,refreshing:state.loading,enabled:!locked&&panel!=='report',label:'la transacción'}}>
 {state.error&&<><Text accessibilityRole="alert" style={ui.subtitle}>{state.error}</Text><RequestButton label="Actualizar estado" onPress={state.read} disabled={locked}/></>}
 {!state.verified&&state.loading?<AgreementPanelSkeleton digital panel={panel==='accepted'?'accepted':panel==='menu'?'menu':'confirm'}/>:state.verified&&<>
 {panel==='accepted'&&<DigitalResourceContent id={trade.publicationId} trade={trade} onBusyChange={setReportBusy}/>}
 {panel==='menu'&&<AgreementMenu embedded visible onClose={onClose} actions={[{label:'Abrir chat',disabled,onPress:()=>setPanel('coordinate')},{label:'Denunciar transacción',disabled,onPress:()=>setPanel('report')},...(trade.canCancel?[{label:'Cancelar transacción',danger:true,disabled,onPress:()=>setPanel('cancel')}]:[])]}/>}
 {panel==='report'&&state.fresh&&<MarketplaceReportForm target={{type:'TRANSACCION_DIGITAL',publicationId:trade.publicationId,transactionId:trade.id,campusId:trade.campusId}} title={trade.title} onBack={()=>setPanel('menu')} onBusyChange={setReportBusy} showHeading={false} backLabel={null}/>}
 {panel==='cancel'&&<View style={{gap:16}}><Text style={ui.subtitle}>Se cancelará esta transacción sin conceder acceso a los archivos completos. Las demás transacciones y la publicación se conservan.</Text>
 <RequestButton label={state.busy?'Cancelando…':'Confirmar cancelación'} primary disabled={disabled||!trade.canCancel} onPress={()=>void state.run('cancel')}/>
 <RequestButton label="Conservar transacción" disabled={locked} onPress={()=>setPanel('menu')}/>{trade.status==='CANCELADA'&&<Text style={ui.subtitle}>Transacción cancelada.</Text>}</View>}
 {panel==='confirm'&&(rating?<OwnerRating singleStep owner={participants.find(row=>row.role==='PROPIETARIO')?.name} canRate rating={null} score={score} confirming={false} disabled={disabled} busy={state.busy} onSelect={setScore} onPrepare={()=>{}} onCancel={()=>{}} onSend={()=>void state.run('rate',score??undefined)}/>
 :trade.rating&&score?<View style={{gap:12}}><Text style={ui.sectionTitle}>Gracias por valorar</Text><RequestButton label="Listo" primary onPress={onClose} disabled={locked}/></View>
 :<TransactionConfirmations participants={participants} confirmations={trade.confirmations} currentUserId={state.viewerId} variant="people" donation={trade.modality==='DONACION'}>
 {trade.canConfirm&&<RequestButton label={state.busy?'Confirmando…':'Confirmar que se realizó'} primary disabled={disabled} onPress={()=>void state.run('confirm')}/>}
 {trade.status==='CANCELADA'&&<Text style={ui.subtitle}>Esta transacción fue cancelada.</Text>}
 <AgreementNotice/>
 {trade.status==='COMPLETADA'&&trade.receiverId===state.viewerId&&<RequestButton label="Abrir en Adquiridos" primary disabled={disabled} onPress={()=>onAcquired(trade.publicationId)}/>}
 </TransactionConfirmations>)}
 </>}
 </AgreementStepModal>;
}
