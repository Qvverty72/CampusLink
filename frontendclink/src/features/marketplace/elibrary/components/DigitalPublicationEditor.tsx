import {useEffect} from 'react';
import {ActivityIndicator,Pressable,Text,TextInput,View} from 'react-native';
import {Archive} from 'lucide-react-native';
import {CATALOG_COLORS as c} from '../../components/CatalogUI';
import {PublicationSection,PublicationModality,PublicationFeedback,PublicationSubmit,publicationUI as f} from '../../components/PublicationFormUI';
import {ManagementAction,publicationManagementUI as s} from '../../components/PublicationManagementUI';
import {RequestButton} from '../../components/RequestsUI';
import {useEditDigitalPublication} from '../hooks/useEditDigitalPublication';
import type {DigitalPublication} from '../types/publication';

export function DigitalPublicationEditor({resource,onSaved,onClose,onBusyChange,mode}:{resource:DigitalPublication;onSaved:(value:DigitalPublication)=>void;onClose:()=>void;onBusyChange?:(busy:boolean)=>void;mode?:'edit'|'withdraw'}){
 const editor=useEditDigitalPublication(resource,onSaved);
 useEffect(()=>{onBusyChange?.(editor.busy);return()=>onBusyChange?.(false);},[editor.busy,onBusyChange]);
 const available=!editor.resource.isWithdrawn&&editor.resource.status==='DISPONIBLE';
 const disabled=editor.busy||editor.mustReload,withdrawing=mode==='withdraw'||editor.retiring;
 const cancel=()=>{if(editor.busy)return;if(!mode&&editor.retiring)editor.setRetiring(false);else onClose();};
 return <View style={f.form}>
  {!available?<Text style={s.body}>Esta publicación está retirada o no disponible para editar. Sus archivos y acuerdos se conservan.</Text>:withdrawing?<View style={[s.card,s.dangerCard]}>
   <View accessible={false} aria-hidden style={[s.actionIcon,s.dangerIcon]}><Archive size={24} color="#AD3029"/></View>
   <Text accessibilityRole="header" style={s.sectionTitle}>¿Retirar esta publicación?</Text>
   <Text style={s.body}>Dejará de aparecer en búsquedas y no recibirá nuevas solicitudes.</Text>
   <Text style={s.helper}>Conservarás el historial de solicitudes y transacciones. Quienes ya adquirieron el recurso mantendrán el acceso a sus archivos.</Text>
   <PublicationFeedback error={editor.error}/>
   <Pressable accessibilityRole="button" accessibilityLabel="Confirmar retirada digital" disabled={disabled} accessibilityState={{disabled,busy:editor.busy}} onPress={editor.retire} style={[s.dangerButton,disabled&&s.disabled]}>
    {editor.busy&&<ActivityIndicator color={c.surface}/>}<Text style={s.dangerButtonText}>{editor.busy?'Retirando…':'Retirar publicación'}</Text>
   </Pressable>
   <RequestButton label="Conservar publicación" disabled={editor.busy} onPress={cancel}/>
  </View>:<>
   <PublicationSection number="1" title="Datos del recurso">
    <View style={f.field}><Text style={f.label}>Nombre del recurso *</Text><TextInput accessibilityLabel="Editar título digital" value={editor.title} onChangeText={editor.setTitle} editable={!disabled} maxLength={200} style={f.input}/></View>
    <View style={f.field}><Text style={f.label}>Descripción *</Text><TextInput accessibilityLabel="Editar descripción digital" value={editor.description} onChangeText={editor.setDescription} editable={!disabled} maxLength={4000} multiline style={[f.input,f.textarea]}/></View>
   </PublicationSection>
   <PublicationSection number="2" title="Modalidad y precio">
    <PublicationModality value={editor.modality} disabled={disabled} onChange={editor.setModality}/>
    {editor.modality==='VENTA'&&<View style={f.field}><Text style={f.label}>Precio de venta (CLP) *</Text><TextInput accessibilityLabel="Editar precio digital" value={editor.price} onChangeText={editor.setPrice} inputMode="decimal" editable={!disabled} maxLength={20} style={f.input}/></View>}
   </PublicationSection>
   <Text style={f.hint}>Los cambios no modifican las condiciones de transacciones anteriores ni los accesos adquiridos.</Text>
   <PublicationFeedback error={editor.error}/>
   <PublicationSubmit label={editor.busy?'Guardando cambios…':'Guardar cambios'} busy={editor.busy} disabled={disabled} onPress={editor.save}/>
   <RequestButton label="Cancelar edición" disabled={editor.busy} onPress={cancel}/>
   {!mode&&<View style={s.withdrawOption}><ManagementAction icon={Archive} title="Retirar publicación" description="Dejará de aparecer en la Biblioteca." danger disabled={disabled} onPress={()=>editor.setRetiring(true)}/></View>}
  </>}
  {editor.mustReload&&<View style={s.errorBox}><Text style={s.helper}>Recargar descarta los cambios de este formulario y consulta la información vigente.</Text><RequestButton label="Recargar publicación para editar" disabled={editor.busy} onPress={editor.reload}/></View>}
  {!available&&<RequestButton label="Volver" disabled={editor.busy} onPress={onClose}/>}
 </View>;
}
