import { APP_COLORS } from '@/types/colors';
import { useEffect,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useContentReport } from '../hooks/useContentReport';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { ContentReportTarget } from '../types/contentReport';
import { ACTIVITY_REPORT_REASONS, isActivityReportReceipt } from '@/features/activities/types/activityReport';
import { ActivityReportConfirmation } from '@/features/activities/components/ActivityReportConfirmation';
import { ActivityBackButton } from '@/features/activities/components/ActivityBackButton';
import { ActivityReportSkeleton } from '@/features/activities/components/ActivityReportSkeleton';

interface Props {target:ContentReportTarget;title:string;onBack:()=>void;onBusyChange?:(busy:boolean)=>void}
/** Formulario común de denuncias dentro del detalle; no lista ni expone casos administrativos. */
export function ContentReportForm(props:Props) {
  const {identity}=useAuth();
  return <ReportFields key={JSON.stringify([identity?.userId,identity?.campusId,props.target])} {...props}/>;
}
function ReportFields({target,title,onBack,onBusyChange}:Props) {
  const [reason,setReason]=useState(''),[description,setDescription]=useState(''),[validation,setValidation]=useState<string|null>(null);
  const [reasonMenuOpen,setReasonMenuOpen]=useState(false);
  const {submit,busy,error,receipt,checking,lookupError,retryLookup}=useContentReport(target);
  const activity=target.type==='ACTIVIDAD',transaction=target.type==='TRANSACCION'||target.type==='TRANSACCION_DIGITAL',digital=target.type==='PUBLICACION_DIGITAL'||target.type==='TRANSACCION_DIGITAL';
  const selectedReason=ACTIVITY_REPORT_REASONS.find(option=>option.code===reason);
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
  const send=()=>{
    if(activity&&!selectedReason){setValidation('Selecciona un motivo de la lista.');return;}
    if(!reason.trim()||reason.trim().length>200||description.trim().length>2000){setValidation('Escribe un motivo de hasta 200 caracteres y una descripción opcional de hasta 2000.');return;}
    setReasonMenuOpen(false);
    setValidation(null);void submit({reason:reason.trim(),...(description.trim()?{description:description.trim()}:{})});
  };
  if (activity && receipt && isActivityReportReceipt(receipt)) {
    return <ActivityReportConfirmation title={title} receipt={receipt} onBack={onBack}/>;
  }
  if (activity && checking) return <View style={styles.form}>
    <ActivityBackButton label="Volver a la ficha" onBack={onBack}/>
    <ActivityReportSkeleton/>
  </View>;
  return <View style={styles.form}>
    {activity?<ActivityBackButton label="Volver a la ficha" onBack={onBack} disabled={busy}/>:null}
    <Text accessibilityRole="header" style={styles.title}>{activity?'Denunciar actividad':transaction?'Denunciar transacción':'Denunciar publicación'}</Text>
    <Text style={styles.text}>{title}</Text>
    {receipt?<>
      <Text accessibilityLiveRegion="polite" style={styles.heading}>{receipt.status==='PENDIENTE'
        ?'Denuncia enviada. Quedó pendiente de revisión.'
        :receipt.status==='EN_REVISION'?'Denuncia enviada. Está en revisión.'
          :receipt.status==='RESUELTO'?'Denuncia enviada. Ya fue resuelta.':'Denuncia enviada. Fue desestimada.'}</Text>
      <Text style={styles.text}>Fecha: {new Date(receipt.reportedAt).toLocaleString('es-CL')}</Text>
      <Text style={styles.text}>{activity?'Enviar la denuncia no oculta la actividad ni cambia las inscripciones.':'Enviar la denuncia no oculta la publicación ni modifica la transacción.'}</Text>
    </>:lookupError?<>
      <Text accessibilityRole="alert" style={styles.error}>{lookupError}</Text>
      <Pressable accessibilityRole="button" onPress={retryLookup} style={styles.back}>
        <Text style={styles.link}>Reintentar consulta</Text>
      </Pressable>
    </>:<>
      <Text style={styles.text}>{activity?'Selecciona el motivo para que la administración de tu campus pueda revisar el caso. La actividad seguirá visible mientras se revisa.':digital?'Describe el motivo para que la administración del campus de origen pueda revisar el caso. El recurso y sus accesos se conservan.':'Describe el motivo y lo ocurrido para que la administración de tu campus pueda revisar el caso. Enviar la denuncia no cambia el estado de la publicación ni del intercambio.'}</Text>
      <Text style={styles.heading}>Motivo (obligatorio)</Text>
      {activity?<View style={styles.reasonField} onAccessibilityEscape={()=>setReasonMenuOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Motivo de la denuncia"
          accessibilityValue={{text:selectedReason?.label??'Selecciona un motivo'}}
          accessibilityState={{disabled:busy,expanded:reasonMenuOpen}} aria-expanded={reasonMenuOpen}
          disabled={busy} onPress={()=>setReasonMenuOpen(open=>!open)}
          style={[styles.input,styles.reasonTrigger,reasonMenuOpen&&styles.reasonActive,busy&&styles.disabled]}>
          <Text style={[styles.reasonLabel,!selectedReason&&styles.placeholder]}>{selectedReason?.label??'Selecciona un motivo'}</Text>
          <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {reasonMenuOpen?<ChevronUp size={18} color={APP_COLORS.PRIMARY}/>:<ChevronDown size={18} color={APP_COLORS.PRIMARY}/>}
          </View>
        </Pressable>
        {reasonMenuOpen?<ScrollView style={styles.reasonMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <View accessibilityRole="radiogroup" accessibilityLabel="Motivos de denuncia de actividad">
            {ACTIVITY_REPORT_REASONS.map(option=>{
              const selected=reason===option.code;
              return <Pressable key={option.code} accessibilityRole="radio" accessibilityLabel={option.label}
                accessibilityState={{checked:selected,disabled:busy}} aria-checked={selected} disabled={busy}
                onPress={()=>{setReason(option.code);setReasonMenuOpen(false);setValidation(null);}}
                style={[styles.reasonOption,selected&&styles.reasonSelected]}>
                <Text style={[styles.reasonLabel,selected&&styles.reasonSelectedText]}>{option.label}</Text>
                {selected?<View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Check size={18} color={APP_COLORS.PRIMARY}/>
                </View>:null}
              </Pressable>;
            })}
          </View>
        </ScrollView>:null}
      </View>:<TextInput accessibilityLabel="Motivo de la denuncia" value={reason} onChangeText={setReason} editable={!busy} maxLength={200}
        placeholder="Motivo de la denuncia" style={styles.input}/>}
      <Text style={styles.heading}>Descripción (opcional)</Text>
      <TextInput accessibilityLabel="Descripción de la denuncia" value={description} onChangeText={setDescription} editable={!busy} maxLength={2000}
        multiline textAlignVertical="top" placeholder="Explica lo ocurrido" style={[styles.input,styles.description]}/>
      {validation||error?<Text accessibilityRole="alert" style={styles.error}>{validation??error}</Text>:null}
      <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} onPress={send} style={[styles.send,busy&&{opacity:0.6}]}>
        {busy?<ActivityIndicator accessibilityLabel="Enviando denuncia" color="#FFFFFF"/>:<Text style={styles.sendText}>Enviar denuncia</Text>}
      </Pressable>
    </>}
    {!activity?<Pressable accessibilityRole="button" disabled={busy} onPress={onBack} style={styles.back}>
      <Text style={styles.link}>{transaction?'Volver al acuerdo':'Volver al detalle'}</Text>
    </Pressable>:null}
  </View>;
}
const styles=StyleSheet.create({
  form:{gap:12,paddingVertical:12},title:{fontSize:21,fontWeight:'700',color:'#0F172A'},
  heading:{fontSize:16,fontWeight:'600',color:'#0F172A'},text:{color:'#334155',lineHeight:22},
  input:{padding:12,borderWidth:1,borderColor:'#CBD5E1',borderRadius:8,color:'#0F172A',backgroundColor:'#FFFFFF'},
  reasonField:{gap:6},reasonTrigger:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12},
  reasonLabel:{flex:1,minWidth:0,color:'#0F172A',lineHeight:21},placeholder:{color:'#64748B'},
  reasonActive:{borderColor:APP_COLORS.PRIMARY},disabled:{opacity:0.6},
  reasonMenu:{maxHeight:280,borderWidth:1,borderColor:'#CBD5E1',borderRadius:8,backgroundColor:'#FFFFFF'},
  reasonOption:{minHeight:48,padding:12,flexDirection:'row',alignItems:'center',gap:12},
  reasonSelected:{backgroundColor:'#E6F3F3'},reasonSelectedText:{color:APP_COLORS.PRIMARY,fontWeight:'600'},
  description:{minHeight:110},error:{color:'#B91C1C',lineHeight:22},
  send:{padding:14,borderRadius:10,backgroundColor:APP_COLORS.PRIMARY,alignItems:'center'},sendText:{color:'#FFFFFF',fontWeight:'700'},
  back:{paddingVertical:12},link:{color:APP_COLORS.PRIMARY,fontWeight:'700'},
});
