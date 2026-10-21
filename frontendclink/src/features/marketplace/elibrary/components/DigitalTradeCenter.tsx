import { ActivityIndicator,Pressable,StyleSheet,Text,View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { useDigitalRequestAction,useDigitalTradeCenter } from '../hooks/useDigitalTrades';
export const digitalTradeStatus=(value:string)=>({PENDIENTE:'Pendiente',ACEPTADA:'Aceptada',RECHAZADA:'Rechazada',CANCELADA:'Cancelada',RESERVADA:'Acuerdo iniciado',PENDIENTE_CONFIRMACION:'Esperando confirmación',COMPLETADA:'Completada'}[value]??value);
export function DigitalRequestAction({id}:{id:string}) {
  const state=useDigitalRequestAction(id);
  return <View style={styles.box}>
    {state.error&&<Text style={styles.error} accessibilityLiveRegion="polite">{state.error}</Text>}
    {!state.options?<><ActivityIndicator/><Pressable accessibilityRole="button" onPress={state.reload} style={styles.button}><Text style={styles.link}>Actualizar solicitud</Text></Pressable></>:state.options.acquired?<Text style={styles.text}>Ya adquiriste este recurso. Consulta tus materiales adquiridos.</Text>:state.options.activeRequestId?<Text style={styles.text}>Ya tienes una solicitud registrada. Revisa Mis solicitudes y acuerdos.</Text>:state.options.canRequest?<>
      <Text style={styles.heading}>Solicitar este recurso</Text><Text style={styles.text}>Selecciona un mensaje para el propietario.</Text>
      {state.options.messages.map(row=><Pressable key={row.code} accessibilityRole="radio" aria-checked={state.code===row.code} accessibilityState={{checked:state.code===row.code}} disabled={state.busy} onPress={()=>state.setCode(row.code)} style={[styles.option,state.code===row.code&&styles.selected]}><Text style={styles.text}>{row.description}</Text></Pressable>)}
      <Pressable accessibilityRole="button" disabled={state.busy||!state.code} onPress={state.submit} style={styles.button}>{state.busy?<ActivityIndicator/>:<Text style={styles.link}>Enviar solicitud digital</Text>}</Pressable>
    </>:<Text style={styles.text}>Este recurso no admite una nueva solicitud en este momento.</Text>}
  </View>;
}
export function DigitalTradeCenter(){const state=useDigitalTradeCenter();return <View style={styles.box}>
  <Pressable accessibilityRole="button" disabled={state.busy} onPress={state.toggle} style={styles.button}><Text style={styles.heading}>{state.open?'Cerrar solicitudes y acuerdos':'Mis solicitudes y acuerdos'}</Text></Pressable>
  {state.open&&<>
    {state.error&&<Text style={styles.error} accessibilityLiveRegion="assertive">{state.error}</Text>}
    {state.trade?<>
      <Text style={styles.heading}>{state.trade.title}</Text><Text style={styles.text}>{digitalTradeStatus(state.trade.status)}</Text>
      <Text style={styles.text}>Condiciones acordadas: {state.trade.modality==='DONACION'?'Donación':`${state.trade.amount?.toLocaleString('es-CL')} ${state.trade.currency}`}</Text>
      <Text style={styles.text}>{state.trade.confirmations.length} de 2 confirmaciones. Ambas partes deben confirmar para habilitar el archivo íntegro.</Text>
      {state.trade.canConfirm&&<Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.transition('confirm')} style={styles.button}><Text style={styles.link}>Confirmar mi parte del acuerdo digital</Text></Pressable>}
      {state.trade.canCancel&&<Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.transition('cancel')} style={styles.button}><Text style={styles.link}>Cancelar acuerdo digital</Text></Pressable>}
      {state.trade.status==='COMPLETADA'&&<Text style={styles.text}>El acceso del receptor quedó registrado. CampusLink no procesa pagos.</Text>}
      <Pressable accessibilityRole="button" disabled={state.busy} onPress={state.closeTrade} style={styles.button}><Text style={styles.link}>Volver a mis solicitudes</Text></Pressable>
    </>:<>
      <View style={styles.row}><Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.mode(false)} style={styles.button}><Text style={styles.link}>Enviadas</Text></Pressable><Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.mode(true)} style={styles.button}><Text style={styles.link}>Recibidas</Text></Pressable><Pressable accessibilityRole="button" disabled={state.busy} onPress={state.reload} style={styles.button}><Text style={styles.link}>Actualizar acuerdos</Text></Pressable></View>
      <Text style={styles.heading}>{state.received?'Solicitudes recibidas':'Solicitudes enviadas'}</Text>
      {state.loading?<ActivityIndicator/>:!state.rows.length?<Text style={styles.text}>No hay solicitudes en esta página.</Text>:state.rows.map(row=><View key={row.id} style={styles.option}>
        <Text style={styles.heading}>{row.title}</Text><Text style={styles.text}>{digitalTradeStatus(row.status)} · {new Date(row.requestedAt).toLocaleDateString('es-CL')}</Text>
        {state.received&&<Text style={styles.text}>{row.requesterName}</Text>}<Text style={styles.text}>{row.message}</Text>
        {state.received&&row.status==='PENDIENTE'&&<View style={styles.row}><Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.resolve(row,'ACEPTAR')} style={styles.button}><Text style={styles.link}>Aceptar solicitud digital</Text></Pressable><Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.resolve(row,'RECHAZAR')} style={styles.button}><Text style={styles.link}>Rechazar solicitud digital</Text></Pressable></View>}
        {row.transactionId&&<Pressable accessibilityRole="button" disabled={state.busy} onPress={()=>state.showTrade(row)} style={styles.button}><Text style={styles.link}>Ver acuerdo digital</Text></Pressable>}
      </View>)}
      <View style={styles.row}><Pressable accessibilityRole="button" disabled={state.busy||state.loading||state.page===1} onPress={state.previous} style={styles.button}><Text style={styles.link}>Página anterior de solicitudes</Text></Pressable><Text style={styles.text}>{state.page}</Text><Pressable accessibilityRole="button" disabled={state.busy||state.loading||!state.hasMore} onPress={state.next} style={styles.button}><Text style={styles.link}>Más solicitudes</Text></Pressable></View>
    </>}{state.busy&&<ActivityIndicator accessibilityLabel="Guardando acuerdo"/>}
  </>}
</View>;}
const styles=StyleSheet.create({box:{gap:12,padding:16,borderRadius:16,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E0E8ED'},heading:{fontSize:17,fontWeight:'600',color:'#09243A'},text:{fontSize:15,lineHeight:23,color:'#40596C'},error:{fontSize:15,lineHeight:23,color:'#9D302A'},button:{minHeight:44,justifyContent:'center',paddingVertical:8},link:{color:APP_COLORS.PRIMARY,fontSize:15},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},option:{padding:12,borderWidth:1,borderColor:'#BDCBD5',borderRadius:12,gap:8},selected:{backgroundColor:'#E9F0F6',borderColor:APP_COLORS.PRIMARY}});
