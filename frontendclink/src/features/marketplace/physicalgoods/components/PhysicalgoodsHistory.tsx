import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {RefreshScrollView,useScrollRefresh} from '@/components/RefreshScrollView';
import {usePhysicalgoodsHistory,usePhysicalgoodsHistoryDetail} from '../hooks/usePhysicalgoodsHistory';
import type {PhysicalgoodsHistoryTarget} from '../hooks/usePhysicalgoodsHistory';
import { ActivityAction, ActivityCard, ActivityFeedback, ActivityHeader, ActivityPager, PublicationActivity, activityUI } from '../../components/ActivityUI';
import { CATALOG_COLORS as colors } from '../../components/CatalogUI';
import { ResourceDetailSkeleton, detailUI } from '../../components/ResourceDetailUI';
import {resourceConditions} from '../types/publication';

const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
  onPress={action} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
const state=(value:string)=>value.toLowerCase().replaceAll('_',' ');
const date=(value:string)=>new Date(value).toLocaleString('es-CL');

export function PhysicalgoodsHistory({active,transactions=false,refreshVersion,onDetail,onAgreement,onRequests,onPublish,refreshEnabled=true}:{active:boolean;transactions?:boolean;refreshVersion:number;refreshEnabled?:boolean;
  onDetail:(target:PhysicalgoodsHistoryTarget)=>void;onAgreement:(publicationId:string,transactionId:string)=>void;onRequests?:()=>void;onPublish?:()=>void}) {
  const h=usePhysicalgoodsHistory(active,transactions,refreshVersion);
  useScrollRefresh(h.reload,h.loading,active&&refreshEnabled&&!h.loading,transactions?'mis transacciones':'mis publicaciones',active);
  return <View style={activityUI.section}>
    <ActivityHeader compact title={transactions?'Mis transacciones':'Mis publicaciones'} helper={transactions ? 'Compras, ventas y donaciones, con su campus de origen.' : 'Gestiona tus recursos, incluidas las publicaciones retiradas.'} loading={h.loading} onReload={h.reload} />
    <ActivityFeedback loading={h.loading} error={h.error} empty={Boolean(h.page&&!h.page.data.length)} onReload={h.reload}
      emptyTitle={transactions?'No hay transacciones en esta página':'Aún no hay publicaciones en esta página'} emptyAction={!transactions && onPublish ? 'Publicar recurso' : undefined} onEmptyAction={!transactions ? onPublish : undefined}
      emptyHelper={transactions?'Tus acuerdos aparecerán aquí cuando una solicitud sea aceptada.':'Los recursos que compartas aparecerán aquí junto con su actividad.'} />
    {!h.loading&&Boolean(h.page?.data.length)&&<View style={activityUI.list}>{h.page?.data.map(row=>{
      const transaction='publication' in row,publication=transaction?row.publication:row;
      const historical=publication.isWithdrawn||['FINALIZADO','CANCELADO','CANCELADA','COMPLETADA','OCULTO'].includes(row.status);
      return <ActivityCard key={row.id} title={publication.title} status={publication.isWithdrawn&&!transaction?'RETIRADA':row.status} historical={historical}
        helper={`${row.campus.name} · ${new Date(transaction?row.startedAt:row.publishedAt).toLocaleDateString('es-CL')}`}
        keyData={row.modality==='DONACION'?'Donación':`$${(transaction?row.amount:row.price)?.toLocaleString('es-CL')}`}
        role={transaction ? row.role==='PROPIETARIO' ? row.status==='COMPLETADA'?'Entregaste':'Propietario' : row.status==='COMPLETADA'?'Recibiste':'Receptor' : 'Tu publicación'}>
        {transaction?<ActivityAction label="Ver acuerdo" accessibilityLabel={'Ver acuerdo: '+publication.title} onPress={()=>onAgreement(publication.id,row.id)} />
          :<PublicationActivity activity={row.activity} onRequests={onRequests}><ActivityAction label="Ver publicación" accessibilityLabel={'Ver publicación: '+publication.title} onPress={()=>onDetail({publicationId:row.id})} /></PublicationActivity>}
      </ActivityCard>;
    })}</View>}
    <ActivityPager page={h.number} hasMore={Boolean(h.page?.meta.hasMore)} disabled={h.loading} onPrevious={()=>h.setNumber(h.number-1)} onNext={()=>h.setNumber(h.number+1)} />
  </View>;
}

export function PhysicalgoodsHistoryDetail({target,onClose,onOpen,onAgreement,refreshEnabled=true}:{target:PhysicalgoodsHistoryTarget;onClose:()=>void;refreshEnabled?:boolean;
  onOpen?:(id:string)=>void;onAgreement:(publicationId:string,transactionId:string)=>void}) {
  const h=usePhysicalgoodsHistoryDetail(target),detail=h.detail;
  const request=detail&&'publication' in detail?detail:null,publication=request?.publication??(detail&&'title' in detail?detail:null);
  return <Modal visible animationType="slide" onRequestClose={onClose}><RefreshScrollView style={detailUI.page} contentContainerStyle={styles.content}
    onRefresh={h.reload} refreshing={h.loading} refreshEnabled={refreshEnabled&&!h.loading} refreshLabel="el detalle del historial">
    {button('Cerrar detalle del historial',onClose)}
    <Text accessibilityRole="header" style={styles.title}>{target.requestId?'Detalle de solicitud':'Mi publicación'}</Text>
    {button('Actualizar detalle del historial',h.reload,h.loading)}
    {h.loading&&<ResourceDetailSkeleton />}
    {h.error&&<Text accessibilityRole="alert" style={styles.error}>{h.error}</Text>}
    {detail&&publication&&<View style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>{publication.title}</Text>
      <Text style={styles.text}>Campus de origen: {detail.campus.name}</Text>
      <Text style={styles.text}>Publicación: {state(publication.status)}</Text>
      {publication.isWithdrawn&&<Text style={styles.text}>Publicación retirada. Se conserva su historial.</Text>}
      <Text style={styles.text}>{publication.modality==='DONACION'?'Donación':`Venta · ${publication.price?.toLocaleString('es-CL')} CLP`}</Text>
      {request&&<>
        <Text style={styles.text}>Propietario: {request.owner.fullName}</Text>
        <Text style={styles.text}>Solicitante: {request.requester.fullName}</Text>
        <Text style={styles.label}>Solicitud: {state(request.status)}</Text>
        <Text style={styles.text}>{request.message}</Text><Text style={styles.text}>Enviada: {date(request.requestedAt)}</Text>
        {request.transaction&&button('Ver acuerdo: '+publication.title,()=>onAgreement(publication.id,request.transaction!.id))}
      </>}
      {'description' in detail&&<>
        {detail.activeTransaction&&button('Ver acuerdo pendiente: '+publication.title,()=>onAgreement(publication.id,detail.activeTransaction!.id))}
        <Text style={styles.text}>{detail.description}</Text>
        <Text style={styles.text}>Categoría: {detail.category.name}</Text>
        <Text style={styles.text}>Condición: {resourceConditions.find(row=>row.value===detail.condition)?.label}</Text>
        <Text style={styles.text}>Publicado: {date(detail.publishedAt)}</Text>
        {detail.images.map(image=><View key={image.id} style={styles.section}>
          <Image source={{uri:image.url}} accessibilityLabel={image.name} style={styles.photo} />
          {image.principal&&<Text style={styles.text}>Imagen principal</Text>}
        </View>)}
      </>}
      {publication.canView ? onOpen && button('Abrir recurso en mi campus',()=>onOpen(publication.id)) :
        <Text style={styles.text}>Consulta histórica. Este recurso no está disponible para interacción en tu campus actual.</Text>}
    </View>}
  </RefreshScrollView></Modal>;
}
const styles=StyleSheet.create({
  section:{gap:14,marginTop:24},content:{padding:24,paddingTop:48,paddingBottom:60,gap:16,width:'100%',maxWidth:760,alignSelf:'center'},
  title:{color:colors.ink,fontSize:24,fontWeight:'700'},label:{color:colors.ink,fontSize:16,fontWeight:'600'},text:{color:colors.muted,fontSize:15,lineHeight:23},
  card:{backgroundColor:'#FFFFFF',padding:20,borderRadius:18,gap:12},button:{padding:12,borderRadius:10,borderWidth:1,borderColor:colors.primary},
  action:{color:colors.primary,fontSize:15,fontWeight:'600'},choices:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},
  disabled:{opacity:0.5},error:{color:'#AD3029',fontSize:15},photo:{width:'100%',height:240,resizeMode:'contain',backgroundColor:'#F4F7F9',borderRadius:12},
});
