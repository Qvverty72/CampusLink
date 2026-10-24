import {Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {RefreshScrollView,useScrollRefresh} from '@/components/RefreshScrollView';
import {usePhysicalgoodsHistory,usePhysicalgoodsHistoryDetail} from '../hooks/usePhysicalgoodsHistory';
import type {PhysicalgoodsHistoryTarget} from '../hooks/usePhysicalgoodsHistory';
import { ActivityAction, ActivityCard, ActivityFeedback, ActivityHeader, ActivityPager, PublicationActivity, activityUI } from '../../components/ActivityUI';
import { CATALOG_COLORS as colors } from '../../components/CatalogUI';
import { ResourceDetailSkeleton, detailUI } from '../../components/ResourceDetailUI';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DetailActionBar, DetailHeader, RequestResourceSummary } from '../../components/ResourceDetailUI';
import { PersonalStatus } from '../../components/PersonalUI';
import { RequestTimeline } from '../../components/RequestFlowUI';
import { PhysicalgoodsAgreements } from './PhysicalgoodsAgreements';
import {resourceConditions} from '../types/publication';
import type {PhysicalgoodsOwnPage} from '../types/publication';

const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
  onPress={action} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
const state=(value:string)=>value.toLowerCase().replaceAll('_',' ');
const date=(value:string)=>new Date(value).toLocaleString('es-CL');

type HistoryProps = {active:boolean;transactions?:boolean;refreshVersion:number;refreshEnabled?:boolean;
  onDetail:(target:PhysicalgoodsHistoryTarget)=>void;onAgreement:(publicationId:string,transactionId:string)=>void;onRequests?:()=>void;onPublish?:()=>void;onExplore?:()=>void;showTitle?:boolean};
export function PhysicalgoodsHistory(props: HistoryProps) {
  return props.transactions ? <PhysicalgoodsAgreements active={props.active} refreshVersion={props.refreshVersion} onAgreement={props.onAgreement} onExplore={props.onExplore} refreshEnabled={props.refreshEnabled} showTitle={props.showTitle} />
    : <PhysicalgoodsPublicationHistory {...props} />;
}
function PhysicalgoodsPublicationHistory({active,refreshVersion,onDetail,onRequests,onPublish,refreshEnabled=true}:HistoryProps) {
  const h=usePhysicalgoodsHistory(active,false,refreshVersion),page=h.page as PhysicalgoodsOwnPage|null;
  useScrollRefresh(h.reload,h.loading,active&&refreshEnabled&&!h.loading,'mis publicaciones',active);
  return <View style={activityUI.section}>
    <ActivityHeader compact title="Mis publicaciones" helper="Gestiona tus recursos, incluidas las publicaciones retiradas." loading={h.loading} onReload={h.reload} />
    <ActivityFeedback loading={h.loading} error={h.error} empty={Boolean(h.page&&!h.page.data.length)} onReload={h.reload}
      emptyTitle="Aún no hay publicaciones en esta página" emptyAction={onPublish ? 'Publicar recurso' : undefined} onEmptyAction={onPublish}
      emptyHelper="Los recursos que compartas aparecerán aquí junto con su actividad." />
    {!h.loading&&Boolean(page?.data.length)&&<View style={activityUI.list}>{page?.data.map(row=>{
      const historical=row.isWithdrawn||['FINALIZADO','CANCELADO','CANCELADA','COMPLETADA','OCULTO'].includes(row.status);
      return <ActivityCard key={row.id} title={row.title} status={row.isWithdrawn?'RETIRADA':row.status} historical={historical}
        helper={`${row.campus.name} · ${new Date(row.publishedAt).toLocaleDateString('es-CL')}`}
        keyData={row.modality==='DONACION'?'Donación':`$${row.price?.toLocaleString('es-CL')}`} role="Tu publicación">
        <PublicationActivity activity={row.activity} onRequests={onRequests}><ActivityAction label="Ver publicación" accessibilityLabel={'Ver publicación: '+row.title} onPress={()=>onDetail({publicationId:row.id})} /></PublicationActivity>
      </ActivityCard>;
    })}</View>}
    <ActivityPager page={h.number} hasMore={Boolean(h.page?.meta.hasMore)} disabled={h.loading} onPrevious={()=>h.setNumber(h.number-1)} onNext={()=>h.setNumber(h.number+1)} />
  </View>;
}

export function PhysicalgoodsHistoryDetail({target,onClose,onOpen,onAgreement,refreshEnabled=true}:{target:PhysicalgoodsHistoryTarget;onClose:()=>void;refreshEnabled?:boolean;
  onOpen?:(id:string)=>void;onAgreement:(publicationId:string,transactionId:string)=>void}) {
  const h=usePhysicalgoodsHistoryDetail(target),detail=h.detail;
  const insets = useSafeAreaInsets();
  const request=detail&&'publication' in detail?detail:null,publication=request?.publication??(detail&&'title' in detail?detail:null);
  const openResource = publication?.canView && onOpen ? () => onOpen(publication.id) : undefined;
  const openAgreement = request?.transaction && publication ? () => onAgreement(publication.id, request.transaction!.id) : undefined;
  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={detailUI.page}>
    <RefreshScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 8), paddingBottom: 24 }]}
      onRefresh={h.reload} refreshing={h.loading} refreshEnabled={refreshEnabled&&!h.loading} refreshLabel="el detalle del historial">
      <DetailHeader title="Mi actividad" onBack={onClose} />
      <View style={styles.heading}><Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>{target.requestId?'Detalle de solicitud':'Mi publicación'}</Text>
        {request && <PersonalStatus status={request.transaction?.status === 'COMPLETADA' ? 'COMPLETADA' : request.transaction?.status === 'CANCELADA' ? 'CANCELADA' : request.status} />}</View>
      {h.loading&&<ResourceDetailSkeleton />}
      {h.error&&<View style={detailUI.card}><Text accessibilityRole="alert" style={styles.error}>{h.error}</Text>{button('Reintentar detalle',h.reload,h.loading)}</View>}
      {request && publication && <>
        <RequestResourceSummary title={publication.title} modality={publication.modality} price={publication.price} subtitle={`${publication.modality === 'DONACION' ? 'Donación' : 'Venta'} · ${request.campus.name}`} />
        <View style={detailUI.card}>
          <View style={styles.dataRow}><Text style={detailUI.helper}>Propietario</Text><Text style={styles.dataValue}>{request.owner.fullName}</Text></View>
          <View style={styles.dataRow}><Text style={detailUI.helper}>Solicitante</Text><Text style={styles.dataValue}>{request.requester.fullName}</Text></View>
          <View style={styles.dataRow}><Text style={detailUI.helper}>Enviada</Text><Text style={styles.dataValue}>{date(request.requestedAt)}</Text></View>
          <View style={styles.message}><Text style={detailUI.helper}>Mensaje de la solicitud</Text><Text style={detailUI.body}>“{request.message}”</Text></View>
        </View>
        {publication.isWithdrawn && <Text style={detailUI.helper}>Publicación retirada. Se conserva su historial.</Text>}
        <RequestTimeline donation={publication.modality === 'DONACION'} status={request.status} transactionStatus={request.transaction?.status} />
      </>}
      {detail && publication && !request && <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.label}>{publication.title}</Text>
        <Text style={styles.text}>Campus de origen: {detail.campus.name}</Text>
        <Text style={styles.text}>Publicación: {state(publication.status)}</Text>
        {publication.isWithdrawn&&<Text style={styles.text}>Publicación retirada. Se conserva su historial.</Text>}
        <Text style={styles.text}>{publication.modality==='DONACION'?'Donación':`Venta · ${publication.price?.toLocaleString('es-CL')} CLP`}</Text>
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
      </View>}
      {publication && !publication.canView && <Text style={styles.text}>Consulta histórica. Este recurso no está disponible para interacción en tu campus actual.</Text>}
    </RefreshScrollView>
    {!h.loading && !h.error && (openResource || openAgreement) && <DetailActionBar flow label={openResource ? 'Abrir recurso en mi campus' : 'Ver acuerdo'} onPress={openResource ?? openAgreement!}
      secondaryAction={openResource && openAgreement ? { label: 'Ver acuerdo', onPress: openAgreement } : undefined} />}
  </View></Modal>;
}

const styles=StyleSheet.create({
  section:{gap:14,marginTop:24},content:{padding:24,paddingTop:48,paddingBottom:60,gap:16,width:'100%',maxWidth:760,alignSelf:'center'},
  heading:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:10}, dataRow:{flexDirection:'row',alignItems:'flex-start',gap:12}, dataValue:{flex:1,minWidth:0,textAlign:'right',color:colors.ink,fontSize:13,lineHeight:20,fontWeight:'600'}, message:{borderTopWidth:1,borderColor:colors.border,paddingTop:14,marginTop:4,gap:8},
  title:{color:colors.ink,fontSize:28,lineHeight:35,fontWeight:'800'},label:{color:colors.ink,fontSize:16,fontWeight:'600'},text:{color:colors.muted,fontSize:15,lineHeight:23},
  card:{backgroundColor:'#FFFFFF',padding:20,borderRadius:18,gap:12},button:{padding:12,borderRadius:10,borderWidth:1,borderColor:colors.primary},
  action:{color:colors.primary,fontSize:15,fontWeight:'600'},choices:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},
  disabled:{opacity:0.5},error:{color:'#AD3029',fontSize:15},photo:{width:'100%',height:240,resizeMode:'contain',backgroundColor:'#F4F7F9',borderRadius:12},
});
