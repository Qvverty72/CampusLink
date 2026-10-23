import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {RefreshScrollView,useScrollRefresh} from '@/components/RefreshScrollView';
import {usePhysicalgoodsHistory,usePhysicalgoodsHistoryDetail} from '../hooks/usePhysicalgoodsHistory';
import type {PhysicalgoodsHistoryTarget} from '../hooks/usePhysicalgoodsHistory';
import {resourceConditions} from '../types/publication';

const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
  onPress={action} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
const state=(value:string)=>value.toLowerCase().replaceAll('_',' ');
const date=(value:string)=>new Date(value).toLocaleString('es-CL');

export function PhysicalgoodsHistory({active,transactions=false,refreshVersion,onDetail,onAgreement,refreshEnabled=true}:{active:boolean;transactions?:boolean;refreshVersion:number;refreshEnabled?:boolean;
  onDetail:(target:PhysicalgoodsHistoryTarget)=>void;onAgreement:(publicationId:string,transactionId:string)=>void}) {
  const h=usePhysicalgoodsHistory(active,transactions,refreshVersion);
  useScrollRefresh(h.reload,h.loading,active&&refreshEnabled&&!h.loading,transactions?'mis transacciones':'mis publicaciones');
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.title}>{transactions?'Mis transacciones':'Mis publicaciones'}</Text>
    <Text style={styles.text}>Incluye registros cerrados y publicaciones retiradas, conservando su campus de origen.</Text>
    {button('Actualizar '+(transactions?'mis transacciones':'mis publicaciones'),h.reload,h.loading)}
    {h.loading&&<ActivityIndicator accessibilityLabel="Cargando historial" />}
    {h.error&&<Text accessibilityRole="alert" style={styles.error}>{h.error}</Text>}
    {h.page&&!h.page.data.length&&<Text style={styles.text}>No hay {transactions?'transacciones':'publicaciones'} en esta página.</Text>}
    {h.page?.data.map(row=>{
      const transaction='publication' in row,publication=transaction?row.publication:row;
      return <View key={row.id} style={styles.card}>
        <Text accessibilityRole="header" style={styles.label}>{publication.title}</Text>
        <Text style={styles.text}>Campus: {row.campus.name}</Text>
        <Text style={styles.text}>{transaction?'Transacción':'Publicación'}: {state(row.status)}</Text>
        {publication.isWithdrawn&&<Text style={styles.text}>Publicación retirada</Text>}
        <Text style={styles.text}>{row.modality==='DONACION'?'Donación':`Venta · ${(transaction?row.amount:row.price)?.toLocaleString('es-CL')} ${transaction?row.currency:'CLP'}`}</Text>
        <Text style={styles.text}>{transaction?`Tu participación: ${row.role==='PROPIETARIO'?'propietario':'receptor'}`:'Publicado'} · {date(transaction?row.startedAt:row.publishedAt)}</Text>
        {transaction?button('Ver acuerdo: '+publication.title,()=>onAgreement(publication.id,row.id)):
          button('Ver publicación: '+publication.title,()=>onDetail({publicationId:row.id}))}
      </View>;
    })}
    <View style={styles.choices}>
      {button('Página anterior del historial',()=>h.setNumber(h.number-1),h.loading||h.number===1)}
      <Text style={styles.text}>Página {h.number}</Text>
      {button('Página siguiente del historial',()=>h.setNumber(h.number+1),h.loading||!h.page?.meta.hasMore)}
    </View>
  </View>;
}

export function PhysicalgoodsHistoryDetail({target,onClose,onOpen,onAgreement,refreshEnabled=true}:{target:PhysicalgoodsHistoryTarget;onClose:()=>void;refreshEnabled?:boolean;
  onOpen?:(id:string)=>void;onAgreement:(publicationId:string,transactionId:string)=>void}) {
  const h=usePhysicalgoodsHistoryDetail(target),detail=h.detail;
  const request=detail&&'publication' in detail?detail:null,publication=request?.publication??(detail&&'title' in detail?detail:null);
  return <Modal visible animationType="slide" onRequestClose={onClose}><RefreshScrollView contentContainerStyle={styles.content}
    onRefresh={h.reload} refreshing={h.loading} refreshEnabled={refreshEnabled&&!h.loading} refreshLabel="el detalle del historial">
    {button('Cerrar detalle del historial',onClose)}
    <Text accessibilityRole="header" style={styles.title}>{target.requestId?'Detalle de solicitud':'Mi publicación'}</Text>
    {button('Actualizar detalle del historial',h.reload,h.loading)}
    {h.loading&&<ActivityIndicator accessibilityLabel="Cargando detalle del historial" />}
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
  title:{color:'#09243A',fontSize:24,fontWeight:'700'},label:{color:'#09243A',fontSize:16,fontWeight:'600'},text:{color:'#607485',fontSize:15,lineHeight:23},
  card:{backgroundColor:'#FFFFFF',padding:20,borderRadius:18,gap:12},button:{padding:12,borderRadius:10,borderWidth:1,borderColor:'#0B6E75'},
  action:{color:'#0B6E75',fontSize:15,fontWeight:'600'},choices:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},
  disabled:{opacity:0.5},error:{color:'#AD3029',fontSize:15},photo:{width:'100%',height:240,resizeMode:'contain',backgroundColor:'#F4F7F9',borderRadius:12},
});
