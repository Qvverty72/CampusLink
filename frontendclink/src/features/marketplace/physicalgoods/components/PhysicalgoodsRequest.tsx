import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { useRequestPhysicalgoods } from '../hooks/useRequestPhysicalgoods';

/** Formulario de interés sin texto libre; estado y opciones proceden del servidor. */
export function PhysicalgoodsRequest({ resources:r }: { resources:ReturnType<typeof usePhysicalgoodsResources> }) {
  const request = useRequestPhysicalgoods(r);
  if (!request.eligible) return null;
  const button = (label:string,action:()=>void,disabled=false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
  return <View style={styles.form}>
    {(request.loading||request.busy)&&<ActivityIndicator accessibilityLabel={request.busy?'Enviando solicitud':'Comprobando solicitud'} />}
    {request.error&&<Text accessibilityRole="alert" style={styles.error}>{request.error}</Text>}
    {request.options?.activeRequest&&<Text style={styles.label}>Solicitud registrada · Estado: {request.options.activeRequest.status.toLowerCase()}</Text>}
    {request.options?.activeRequest?.status==='PENDIENTE'&&r.gallery?.status==='RESERVADO'&&<Text style={styles.text}>Tu solicitud sigue pendiente mientras se realiza otro intercambio. Este recurso está reservado para otra persona.</Text>}
    {request.options?.canRequest&&<>
      <Text style={styles.label}>Solicitar este recurso</Text>
      <Text style={styles.text}>Selecciona un mensaje para expresar tu interés.</Text>
      {!request.options.messages.length&&<Text style={styles.text}>No hay mensajes disponibles para solicitar este recurso.</Text>}
      {request.options.messages.map(message=><Pressable key={message.code} accessibilityRole="radio" accessibilityLabel={`Mensaje: ${message.label}`}
        accessibilityState={{ checked:request.messageCode===message.code,disabled:request.busy }} disabled={request.busy}
        onPress={()=>request.setMessageCode(message.code)} style={[styles.button,request.messageCode===message.code&&styles.selected]}><Text style={styles.action}>{message.label}</Text></Pressable>)}
      {button('Enviar solicitud',()=>void request.send(),request.busy||!request.messageCode||r.busy)}
    </>}
    {request.options&&!request.options.canRequest&&!request.options.activeRequest&&<Text style={styles.text}>El recurso no admite nuevas solicitudes.</Text>}
    {!request.busy&&button('Actualizar solicitud',request.reload,request.loading)}
  </View>;
}
const styles=StyleSheet.create({
  form:{gap:12},label:{color:'#09243A',fontSize:16,fontWeight:'600'},text:{color:'#607485',fontSize:15,lineHeight:23},
  button:{padding:12,borderRadius:10,borderWidth:1,borderColor:'#C8D7E0'},selected:{borderColor:'#0B6E75',backgroundColor:'#E3F2F0'},
  action:{color:'#0B6E75',fontSize:15},error:{color:'#AD3029',fontSize:15},disabled:{opacity:0.5},
});
