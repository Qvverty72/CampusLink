import {useState} from 'react';
import {Text,View} from 'react-native';
import {PublicationActivityFilters,PublicationActivityRow,PublicationActivitySkeleton,publicationActivityUI as styles} from '../../components/PublicationActivityUI';
import {useMarketplaceRefresh} from '../../hooks/useMarketplaceRefresh';
import {useDigitalActivityPage} from '../hooks/useDigitalActivity';
import type {DigitalPublication} from '../types/publication';
import {DigitalResourceModal} from './DigitalActivityResource';
import {DigitalActivityFeedback,DigitalActivityPager} from './DigitalActivityUI';
import {DigitalPublicationEditor} from './DigitalPublicationEditor';
import {AgreementStepModal} from '../../components/AgreementStepModal';
import {RequestButton} from '../../components/RequestsUI';
import {publicationManagementUI} from '../../components/PublicationManagementUI';
export function DigitalPublications({active,onRequests,onPublish,onChanged,onOpenResource}:{active:boolean;onRequests:()=>void;onPublish?:()=>void;onChanged:()=>void;onOpenResource?:(id:string)=>void}){
 const [tab,setTab]=useState('all'),[page,setPage]=useState(1),[resource,setResource]=useState<DigitalPublication|null>(null),[editing,setEditing]=useState<DigitalPublication|null>(null),[editBusy,setEditBusy]=useState(false);
 const state=useDigitalActivityPage<DigitalPublication>('publications',`page=${page}&limit=10&tab=${tab}`,active);
 const reload=()=>{state.reload();onChanged();};
 useMarketplaceRefresh(reload,state.loading,!resource&&!editing&&!state.loading,'mis publicaciones digitales',active);
 const rows=state.value?.data??[],pending=rows.filter(row=>!row.isWithdrawn&&row.status==='DISPONIBLE'&&(row.activity?.pendingRequests??0)>0),rest=rows.filter(row=>!pending.includes(row));
 const row=(item:DigitalPublication,featured=false)=><PublicationActivityRow key={item.id} digital title={item.title} amount={item.modality==='DONACION'?'Donación':`$${item.price?.toLocaleString('es-CL')}`}
 subtitle={`${item.campusName}${item.publishedAt?` · ${new Date(item.publishedAt).toLocaleDateString('es-CL',{day:'numeric',month:'short'})}`:''}`} status={item.isWithdrawn||item.status!=='DISPONIBLE'?'Desactivada':'Activa'} statusTone={item.isWithdrawn||item.status!=='DISPONIBLE'?'withdrawn':'active'} featured={featured}
 onPress={()=>setResource(item)} onRequests={onRequests}/>;
 return <View style={styles.section}>
 <PublicationActivityFilters tabs={[{id:'all',label:'Todas'},{id:'active',label:'Activas'},{id:'inactive',label:'Desactivadas'}]} selected={tab} onSelect={value=>{setTab(value);setPage(1);}}/>
 {state.initialLoading?<PublicationActivitySkeleton/>:<><DigitalActivityFeedback error={state.error} empty={!rows.length} onRetry={state.reload}/>
 {!rows.length&&!state.error&&onPublish&&<RequestButton label="Publicar recurso" onPress={onPublish} primary/>}
 {pending.length>0&&<View style={styles.group}><Text style={[styles.heading,styles.actionHeading]}>REQUIERE TU ACCIÓN</Text>{pending.map(item=>row(item,true))}</View>}
 {rest.length>0&&<View style={styles.group}><Text style={styles.heading}>MIS PUBLICACIONES</Text><View style={styles.history}>{rest.map(item=>row(item))}</View></View>}
 <DigitalActivityPager meta={state.value?.meta} onChange={setPage} disabled={state.loading}/></>}
 {resource&&<DigitalResourceModal key={resource.id} id={resource.id} title="Recurso de la publicación" mode="owned" initial={resource} onClose={()=>setResource(null)} onEdit={value=>{setResource(null);setEditing(value);}} onOpen={onOpenResource?()=>{setResource(null);onOpenResource(resource.id);}:undefined}/>}
 {editing&&<AgreementStepModal title="Editar publicación" closeLabel="Cerrar edición" onClose={()=>{if(!editBusy)setEditing(null);}} closeDisabled={editBusy} fillHeight keyboardAvoiding contentStyle={publicationManagementUI.content}>
 <DigitalPublicationEditor resource={editing} onBusyChange={setEditBusy} onSaved={()=>{setEditing(null);reload();}} onClose={()=>setEditing(null)}/></AgreementStepModal>}
 </View>;
}
