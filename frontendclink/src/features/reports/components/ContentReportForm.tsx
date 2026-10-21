import { APP_COLORS } from '@/types/colors';
import { useEffect,useState } from 'react';
import { ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View } from 'react-native';
import { useContentReport } from '../hooks/useContentReport';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { ContentReportTarget } from '../types/contentReport';

interface Props {target:ContentReportTarget;title:string;onBack:()=>void;onBusyChange?:(busy:boolean)=>void}
/** Formulario común de denuncias dentro del detalle; no lista ni expone casos administrativos. */
export function ContentReportForm(props:Props) {
  const {identity}=useAuth();
  return <ReportFields key={JSON.stringify([identity?.userId,identity?.campusId,props.target])} {...props}/>;
}
function ReportFields({target,title,onBack,onBusyChange}:Props) {
  const [reason,setReason]=useState(''),[description,setDescription]=useState(''),[validation,setValidation]=useState<string|null>(null);
  const {submit,busy,error,receipt}=useContentReport(target);
  const activity=target.type==='ACTIVIDAD',transaction=target.type==='TRANSACCION'||target.type==='TRANSACCION_DIGITAL',digital=target.type==='PUBLICACION_DIGITAL'||target.type==='TRANSACCION_DIGITAL';
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
  const send=()=>{
    if(!reason.trim()||reason.trim().length>200||description.trim().length>2000){setValidation('Escribe un motivo de hasta 200 caracteres y una descripción opcional de hasta 2000.');return;}
    setValidation(null);void submit({reason:reason.trim(),...(description.trim()?{description:description.trim()}:{})});
  };
  return <View style={styles.form}>
    <Text accessibilityRole="header" style={styles.title}>{activity?'Denunciar actividad':transaction?'Denunciar transacción':'Denunciar publicación'}</Text>
    <Text style={styles.text}>{title}</Text>
    {receipt?<>
      <Text accessibilityLiveRegion="polite" style={styles.heading}>Denuncia enviada. Quedó pendiente de revisión.</Text>
      <Text style={styles.text}>Fecha: {new Date(receipt.reportedAt).toLocaleString('es-CL')}</Text>
      <Text style={styles.text}>{activity?'Enviar la denuncia no oculta la actividad ni cambia las inscripciones.':'Enviar la denuncia no oculta la publicación ni modifica la transacción.'}</Text>
    </>:<>
      <Text style={styles.text}>{activity?'Describe el motivo para que la administración de tu campus pueda revisar el caso. La actividad seguirá visible mientras se revisa.':digital?'Describe el motivo para que la administración del campus de origen pueda revisar el caso. El recurso y sus accesos se conservan.':'Describe el motivo y lo ocurrido para que la administración de tu campus pueda revisar el caso. Enviar la denuncia no cambia el estado de la publicación ni del intercambio.'}</Text>
      <Text style={styles.heading}>Motivo (obligatorio)</Text>
      <TextInput accessibilityLabel="Motivo de la denuncia" value={reason} onChangeText={setReason} editable={!busy} maxLength={200}
        placeholder={activity?'¿Por qué denuncias esta actividad?':'Motivo de la denuncia'} style={styles.input}/>
      <Text style={styles.heading}>Descripción (opcional)</Text>
      <TextInput accessibilityLabel="Descripción de la denuncia" value={description} onChangeText={setDescription} editable={!busy} maxLength={2000}
        multiline textAlignVertical="top" placeholder="Explica lo ocurrido" style={[styles.input,styles.description]}/>
      {validation||error?<Text accessibilityRole="alert" style={styles.error}>{validation??error}</Text>:null}
      <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} onPress={send} style={[styles.send,busy&&{opacity:0.6}]}>
        {busy?<ActivityIndicator accessibilityLabel="Enviando denuncia" color="#FFFFFF"/>:<Text style={styles.sendText}>Enviar denuncia</Text>}
      </Pressable>
    </>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.back}>
      <Text style={styles.link}>{activity?'Volver a la ficha':transaction?'Volver al acuerdo':'Volver al detalle'}</Text>
    </Pressable>
  </View>;
}
const styles=StyleSheet.create({
  form:{gap:12,paddingVertical:12},title:{fontSize:21,fontWeight:'700',color:'#0F172A'},
  heading:{fontSize:16,fontWeight:'600',color:'#0F172A'},text:{color:'#334155',lineHeight:22},
  input:{padding:12,borderWidth:1,borderColor:'#CBD5E1',borderRadius:8,color:'#0F172A',backgroundColor:'#FFFFFF'},
  description:{minHeight:110},error:{color:'#B91C1C',lineHeight:22},
  send:{padding:14,borderRadius:10,backgroundColor:APP_COLORS.PRIMARY,alignItems:'center'},sendText:{color:'#FFFFFF',fontWeight:'700'},
  back:{paddingVertical:12},link:{color:APP_COLORS.PRIMARY,fontWeight:'700'},
});
