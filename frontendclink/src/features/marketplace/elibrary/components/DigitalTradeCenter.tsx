import { ActivityIndicator,Pressable,StyleSheet,Text,View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { useDigitalRequestAction,useDigitalTradeCenter } from '../hooks/useDigitalTrades';
import { useEffect,useState } from 'react';
import { DigitalRequests } from './DigitalRequests';
import { DigitalTransactionDetail } from './DigitalTransactionDetail';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
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
export function DigitalTradeCenter({embedded=false,receivedEntryVersion=0,onAcquired}:{embedded?:boolean;receivedEntryVersion?:number;onAcquired?:(id:string)=>void}={}){const state=useDigitalTradeCenter(embedded,receivedEntryVersion>0);useEffect(()=>{if(receivedEntryVersion>0)state.mode(true);},[receivedEntryVersion]);const [reporting,setReporting]=useState(false),[reportBusy,setReportBusy]=useState(false);useEffect(()=>setReporting(false),[state.trade?.id]);return <View style={{gap:16}}>
  {!embedded&&<Pressable accessibilityRole="button" disabled={state.busy||reportBusy} onPress={state.toggle} style={styles.button}><Text style={styles.heading}>{state.open?'Cerrar solicitudes y acuerdos':'Mis solicitudes y acuerdos'}</Text></Pressable>}
  {state.open&&<>
    {state.tradeTarget?reporting&&state.trade?<MarketplaceReportForm target={{type:'TRANSACCION_DIGITAL',publicationId:state.trade.publicationId,transactionId:state.trade.id,campusId:state.trade.campusId}} title={state.trade.title} onBack={()=>setReporting(false)} onBusyChange={setReportBusy}/>:<DigitalTransactionDetail state={state} onReport={()=>setReporting(true)} onAcquired={onAcquired}/>:<DigitalRequests state={state}/>}
  </>}
</View>;}
const styles=StyleSheet.create({box:{gap:12,padding:16,borderRadius:16,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#E0E8ED'},heading:{fontSize:17,fontWeight:'600',color:'#09243A'},text:{fontSize:15,lineHeight:23,color:'#40596C'},error:{fontSize:15,lineHeight:23,color:'#9D302A'},button:{minHeight:44,justifyContent:'center',paddingVertical:8},link:{color:APP_COLORS.PRIMARY,fontSize:15},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},option:{padding:12,borderWidth:1,borderColor:'#BDCBD5',borderRadius:12,gap:8},selected:{backgroundColor:'#E9F0F6',borderColor:APP_COLORS.PRIMARY}});
