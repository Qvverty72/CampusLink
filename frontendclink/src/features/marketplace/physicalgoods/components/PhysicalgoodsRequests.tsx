import { ActivityIndicator,Pressable,StyleSheet,Text,View } from 'react-native';
import { usePhysicalgoodsRequests } from '../hooks/usePhysicalgoodsRequests';

/** Lista propia por publicación: una reserva conserva las demás solicitudes pendientes. */
export function PhysicalgoodsRequests({active,onOpen,onResolved,onAgreement,onDetail,received=true,refreshVersion=0}:{active:boolean;onOpen:(id:string)=>void;onResolved:()=>void;
  onDetail:(publicationId:string,requestId:string)=>void;
  onAgreement:(publicationId:string,transactionId:string)=>void;received?:boolean;refreshVersion?:number}) {
  const r=usePhysicalgoodsRequests(active,onResolved,received,refreshVersion);
  const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
    onPress={action} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.title}>{received?'Solicitudes recibidas':'Mis solicitudes'}</Text>
    <Text style={styles.text}>{received?'Consulta todas tus solicitudes recibidas. En tu campus actual puedes resolver las pendientes.':'Consulta todas tus solicitudes, incluidas rechazadas y cerradas, también de campus anteriores.'}</Text>
    {button(received?'Actualizar solicitudes recibidas':'Actualizar mis solicitudes',r.reload,r.busy||r.loading)}
    {(r.loading||r.busy)&&<ActivityIndicator accessibilityLabel={r.busy?'Resolviendo solicitud':'Cargando solicitudes recibidas'} />}
    {r.error&&<Text accessibilityRole="alert" style={styles.error}>{r.error}</Text>}
    {r.selection&&<View style={styles.card}>
      <Text style={styles.label}>{r.selection.decision==='ACEPTAR'?'Aceptar':'Rechazar'} la solicitud de {r.selection.request.requester.fullName}</Text>
      <Text style={styles.text}>{r.selection.request.publication.title}</Text>
      <Text style={styles.text}>{r.selection.decision==='ACEPTAR'?'Se iniciará un acuerdo con esta persona y el recurso quedará reservado. Las otras solicitudes seguirán pendientes.':'La solicitud quedará rechazada y se conservará su registro.'}</Text>
      {button('Confirmar '+(r.selection.decision==='ACEPTAR'?'aceptación':'rechazo'),()=>void r.resolve(),r.busy||r.loading)}
      {button('Cancelar resolución',r.cancel,r.busy)}
    </View>}
    {r.page&&!r.page.data.length&&<Text style={styles.text}>No hay solicitudes en esta página.</Text>}
    {r.page?.data.map(request=><View key={request.id} style={styles.card}>
      <Text accessibilityRole="header" style={styles.label}>{request.publication.title}</Text>
      <Text style={styles.text}>Campus: {request.campus.name}</Text>
      <Text style={styles.text}>Recurso: {request.publication.status.toLowerCase()} · {request.publication.modality==='DONACION'?'Donación':`Venta · ${request.publication.price?.toLocaleString('es-CL')} CLP`}</Text>
      {received&&<Text style={styles.label}>{request.requester.fullName}</Text>}
      <Text style={styles.text}>{request.message}</Text>
      <Text style={styles.text}>Solicitud: {request.status.toLowerCase()} · {new Date(request.requestedAt).toLocaleDateString('es-CL')}</Text>
      {request.transaction&&<Text style={styles.text}>Acuerdo: {request.transaction.status.toLowerCase().replace('_',' ')}</Text>}
      {request.transaction&&button('Ver acuerdo: '+request.publication.title,()=>onAgreement(request.publication.id,request.transaction!.id),r.busy)}
      {request.publication.isWithdrawn&&<Text style={styles.text}>Publicación retirada. Se conserva la solicitud.</Text>}
      {!request.publication.canView&&<Text style={styles.text}>Consulta histórica; sin interacción pública en tu campus actual.</Text>}
      {request.publication.canView&&request.status==='PENDIENTE'&&request.publication.status==='RESERVADO'&&<Text style={styles.text}>{received?'Pendiente mientras se realiza otro intercambio. Podrás aceptarla si ese acuerdo se cancela.':'Tu solicitud sigue pendiente mientras se realiza otro intercambio. Este recurso está reservado para otra persona.'}</Text>}
      {received&&request.canResolve&&<View style={styles.choices}>
        {button(`Aceptar solicitud de ${request.requester.fullName}`,()=>r.select(request,'ACEPTAR'),r.busy||r.loading||request.publication.status!=='DISPONIBLE')}
        {button(`Rechazar solicitud de ${request.requester.fullName}`,()=>r.select(request,'RECHAZAR'),r.busy||r.loading)}
      </View>}
      {button('Ver solicitud: '+request.publication.title,()=>onDetail(request.publication.id,request.id),r.busy)}
      {request.publication.canView!==false&&button('Ver recurso: '+request.publication.title,()=>onOpen(request.publication.id),r.busy)}
    </View>)}
    <View style={styles.choices}>
      {button('Solicitudes anteriores',()=>r.setNumber(r.number-1),r.busy||r.loading||r.number===1)}
      <Text style={styles.text}>Página {r.number}</Text>
      {button('Solicitudes siguientes',()=>r.setNumber(r.number+1),r.busy||r.loading||!r.page?.meta.hasMore)}
    </View>
  </View>;
}
const styles=StyleSheet.create({
  section:{gap:14,marginTop:24},title:{fontSize:24,color:'#09243A',fontWeight:'700'},label:{fontSize:16,color:'#09243A',fontWeight:'600'},
  text:{color:'#607485',fontSize:15,lineHeight:23},card:{backgroundColor:'#FFFFFF',padding:20,borderRadius:18,gap:12},
  choices:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10},button:{padding:12,borderRadius:10,borderWidth:1,borderColor:'#0B6E75'},
  action:{color:'#0B6E75',fontSize:15,fontWeight:'600'},disabled:{opacity:0.5},error:{color:'#AD3029',fontSize:15},
});
