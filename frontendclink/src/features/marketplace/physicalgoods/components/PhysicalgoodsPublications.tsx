import {useCallback,useState} from 'react';
import {Text,View} from 'react-native';
import {useAuth} from '@/features/auth/hooks/useAuth';
import {useScrollRefresh} from '@/components/RefreshScrollView';
import {ActivityFeedback,ActivityPager} from '../../components/ActivityUI';
import {PublicationActivityFilters,PublicationActivityRow,PublicationActivitySkeleton,publicationActivityUI as ui} from '../../components/PublicationActivityUI';
import {usePhysicalgoodsHistory} from '../hooks/usePhysicalgoodsHistory';
import type {PhysicalgoodsHistoryTarget} from '../hooks/usePhysicalgoodsHistory';
import type {PhysicalgoodsOwnPage,PhysicalgoodsOwnPublication,PhysicalgoodsPublicationsTab} from '../types/publication';
import {PhysicalgoodsPublicationProduct} from './PhysicalgoodsPublicationProduct';

const tabs:{id:PhysicalgoodsPublicationsTab;label:string}[]=[{id:'all',label:'Todas'},{id:'active',label:'Activas'},{id:'reserved',label:'Reservadas'},{id:'finished',label:'Finalizadas'}];
type Props={active:boolean;refreshVersion:number;refreshEnabled?:boolean;onActivityRefresh?:()=>void;onDetail:(target:PhysicalgoodsHistoryTarget)=>void;onAgreement:(publicationId:string,transactionId:string)=>void;onRequests?:()=>void;onPublish?:()=>void;onOpen?:(id:string)=>void};
export function physicalgoodsPublicationState(row:PhysicalgoodsOwnPublication){
 if(row.isWithdrawn)return {label:'Retirada',tone:'withdrawn' as const,historical:true};
 if(row.status==='FINALIZADO')return {label:'Finalizado',tone:'finished' as const,historical:true};
 if(row.status==='RESERVADO')return {label:'Reservado',tone:'reserved' as const,historical:!row.canView};
 if(row.status==='DISPONIBLE')return {label:'Disponible',tone:'active' as const,historical:!row.canView};
 return {label:row.status.charAt(0)+row.status.slice(1).toLocaleLowerCase('es-CL'),tone:'withdrawn' as const,historical:true};
}
const actionable=(row:PhysicalgoodsOwnPublication)=>row.canView&&!row.isWithdrawn&&row.status==='DISPONIBLE'&&(row.activity?.pendingRequests??0)>0;

/** Cambiar filtro o identidad remonta solo su página y vuelve a1, abortando la lectura anterior. */
export function PhysicalgoodsPublications(props:Props){
 const {identity}=useAuth(),scope=`${identity?.userId??''}:${identity?.campusId??''}`;
 const [selection,setSelection]=useState({scope,tab:'all' as PhysicalgoodsPublicationsTab});
 const tab=selection.scope===scope?selection.tab:'all';
 return <View style={ui.section}><PublicationActivityFilters tabs={tabs} selected={tab} onSelect={value=>setSelection({scope,tab:value})}/><PhysicalgoodsPublicationsPage key={`${scope}:${tab}`} {...props} tab={tab}/></View>;
}

export function PhysicalgoodsPublicationsPage({active,refreshVersion,refreshEnabled=true,onActivityRefresh,onDetail,onAgreement,onRequests,onPublish,onOpen,tab}:{tab:PhysicalgoodsPublicationsTab}&Props){
 const h=usePhysicalgoodsHistory(active,false,refreshVersion,tab),page=h.page as PhysicalgoodsOwnPage|null;
 const [opened,setOpened]=useState<PhysicalgoodsOwnPublication|null>(null);
 const refreshAll=useCallback(()=>{onActivityRefresh?.();h.reload();},[onActivityRefresh,h.reload]);
 const reload=onActivityRefresh?refreshAll:h.reload;
 useScrollRefresh(reload,h.loading,active&&refreshEnabled&&!h.loading&&!opened,'mis publicaciones',active);
 const rows=page?.data??[],groups=[
  {title:'REQUIERE TU ACCIÓN',rows:rows.filter(actionable),featured:true},
  {title:'PUBLICACIONES',rows:rows.filter(row=>!actionable(row)&&!physicalgoodsPublicationState(row).historical),featured:false},
  {title:'HISTORIAL',rows:rows.filter(row=>physicalgoodsPublicationState(row).historical),featured:false},
 ];
 return <View style={ui.section}>
  <ActivityFeedback loading={false} error={h.error} empty={!h.loading&&Boolean(page&&!rows.length)} onReload={reload}
   emptyTitle={tab==='all'?'Aún no tienes publicaciones':'No hay publicaciones en este estado'} emptyAction={tab==='all'&&onPublish?'Publicar recurso':undefined} onEmptyAction={tab==='all'?onPublish:undefined}
   emptyHelper={tab==='all'?'Los recursos que compartas aparecerán aquí.':'Selecciona otro filtro para consultar tus publicaciones.'}/>
  {h.loading?<PublicationActivitySkeleton/>:groups.filter(group=>group.rows.length).map(group=><View key={group.title} style={ui.group}><Text accessibilityRole="header" style={[ui.heading,group.featured&&ui.actionHeading]}>{group.title}</Text>
   <View style={group.featured?ui.group:ui.history}>{group.rows.map((row,index)=>{
    const status=physicalgoodsPublicationState(row),date=new Date(row.publishedAt),dateLabel=date.toDateString()===new Date().toDateString()?'hoy':date.toLocaleDateString('es-CL',{day:'numeric',month:'short'});
    return <PublicationActivityRow key={row.id} title={row.title} amount={row.modality==='DONACION'?'Donación':row.price===null?'Precio no disponible':`$${row.price.toLocaleString('es-CL')}`} subtitle={`${row.campus.name} · ${dateLabel}`} status={status.label} statusTone={status.tone} featured={group.featured} last={index===group.rows.length-1} onPress={()=>setOpened(row)} onRequests={onRequests}/>;
   })}</View></View>)}
  <ActivityPager page={h.number} hasMore={Boolean(page?.meta.hasMore)} disabled={h.loading||Boolean(opened)} onPrevious={()=>h.setNumber(h.number-1)} onNext={()=>h.setNumber(h.number+1)}/>
  {opened&&<PhysicalgoodsPublicationProduct key={opened.id} publication={opened} onClose={()=>setOpened(null)} onManage={()=>{setOpened(null);if(onOpen)onOpen(opened.id);else onDetail({publicationId:opened.id});}} onAgreement={(id,transactionId)=>{setOpened(null);onAgreement(id,transactionId);}}/>}
 </View>;
}
