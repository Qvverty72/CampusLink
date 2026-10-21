import { ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import { useEditDigitalPublication } from '../hooks/useEditDigitalPublication';
import type { DigitalPublication } from '../types/publication';
export function DigitalPublicationEditor({resource,onSaved,onClose}:{resource:DigitalPublication;onSaved:(value:DigitalPublication)=>void;onClose:()=>void}){const editor=useEditDigitalPublication(resource,onSaved);return <View style={styles.box}>
  <Text style={styles.title}>Editar publicación digital</Text>
  {editor.error&&<Text style={styles.error} accessibilityLiveRegion="assertive">{editor.error}</Text>}
  {editor.resource.isWithdrawn||editor.resource.status!=='DISPONIBLE'?<Text style={styles.text}>Esta publicación está retirada o no disponible para editar. Sus archivos y acuerdos se conservan.</Text>:<>
    <TextInput accessibilityLabel="Editar título digital" value={editor.title} onChangeText={editor.setTitle} editable={!editor.busy} maxLength={200} style={styles.input}/>
    <TextInput accessibilityLabel="Editar descripción digital" value={editor.description} onChangeText={editor.setDescription} editable={!editor.busy} maxLength={4000} multiline style={[styles.input,{minHeight:100}]}/>
    <View style={styles.row}>{(['DONACION','VENTA'] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Editar modalidad: ${value==='VENTA'?'Venta':'Donación'}`} aria-checked={editor.modality===value} accessibilityState={{checked:editor.modality===value}} disabled={editor.busy} onPress={()=>editor.setModality(value)} style={styles.button}><Text style={styles.link}>{value==='VENTA'?'Venta':'Donación'}{editor.modality===value?' ✓':''}</Text></Pressable>)}</View>
    {editor.modality==='VENTA'&&<TextInput accessibilityLabel="Editar precio digital" value={editor.price} onChangeText={editor.setPrice} keyboardType="decimal-pad" editable={!editor.busy} maxLength={20} style={styles.input}/>}
    <Text style={styles.text}>Las condiciones anteriores y los accesos adquiridos se conservan. Para reemplazar un archivo original, crea otra publicación.</Text>
    <Pressable accessibilityRole="button" disabled={editor.busy||editor.mustReload} onPress={editor.save} style={styles.button}><Text style={styles.link}>Guardar publicación digital</Text></Pressable>
    {editor.retiring?<><Text style={styles.text}>Dejará de aparecer en búsquedas y no recibirá nuevas solicitudes. Quienes ya adquirieron el recurso conservarán sus archivos.</Text><Pressable accessibilityRole="button" disabled={editor.busy||editor.mustReload} onPress={editor.retire} style={styles.button}><Text style={styles.error}>Confirmar retirada digital</Text></Pressable><Pressable accessibilityRole="button" disabled={editor.busy} onPress={()=>editor.setRetiring(false)} style={styles.button}><Text style={styles.link}>Conservar publicación</Text></Pressable></>:<Pressable accessibilityRole="button" disabled={editor.busy} onPress={()=>editor.setRetiring(true)} style={styles.button}><Text style={styles.error}>Retirar publicación digital</Text></Pressable>}
  </>}
  {editor.mustReload&&<Pressable accessibilityRole="button" disabled={editor.busy} onPress={editor.reload} style={styles.button}><Text style={styles.link}>Recargar publicación para editar</Text></Pressable>}
  {editor.busy&&<ActivityIndicator/>}
  <Pressable accessibilityRole="button" disabled={editor.busy} onPress={onClose} style={styles.button}><Text style={styles.link}>Cancelar edición de publicación</Text></Pressable>
</View>;}
const styles=StyleSheet.create({box:{gap:12},title:{fontSize:19,fontWeight:'700',color:'#09243A'},text:{fontSize:15,lineHeight:23,color:'#40596C'},input:{fontSize:16,minHeight:48,padding:12,borderWidth:1,borderColor:'#BDCBD5',borderRadius:12,color:'#09243A'},button:{minHeight:44,justifyContent:'center'},link:{fontSize:15,color:APP_COLORS.PRIMARY},error:{fontSize:15,lineHeight:23,color:'#9D302A'},row:{flexDirection:'row',gap:16}});
