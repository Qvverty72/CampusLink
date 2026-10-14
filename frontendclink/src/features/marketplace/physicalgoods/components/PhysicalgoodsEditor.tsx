import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { useEditPhysicalgoods } from '../hooks/useEditPhysicalgoods';
import { resourceConditions } from '../types/publication';

export function PhysicalgoodsEditor({ resources: r }: { resources: ReturnType<typeof usePhysicalgoodsResources> }) {
  const edit = useEditPhysicalgoods(r);
  const { draft,setDraft,confirm,setConfirm,error } = edit;
  if (!edit.canManage) return null;
  const button = (label: string, action: () => void) => <Pressable accessibilityRole="button" disabled={r.busy} onPress={action} style={styles.button}><Text style={styles.action}>{label}</Text></Pressable>;
  return <View style={styles.form}>
    {!draft && !confirm && <>
      {button('Editar publicación', edit.start)}
      {button('Retirar publicación', () => setConfirm(true))}
    </>}
    {draft && <>
      <Text style={styles.label}>Editar publicación</Text>
      <TextInput accessibilityLabel="Editar nombre del recurso" value={draft.title} editable={!r.busy} onChangeText={title=>setDraft({ ...draft,title })} maxLength={200} style={styles.input} />
      <TextInput accessibilityLabel="Editar descripción del recurso" value={draft.description} editable={!r.busy} onChangeText={description=>setDraft({ ...draft,description })} maxLength={4000} multiline style={styles.input} />
      <Text style={styles.label}>Condición</Text>
      <View style={styles.choices}>{resourceConditions.map(row=><Pressable key={row.value} accessibilityRole="radio" accessibilityLabel={`Editar condición: ${row.label}`} accessibilityState={{ checked: draft.condition===row.value }} disabled={r.busy} onPress={()=>setDraft({ ...draft,condition: row.value })} style={[styles.button,draft.condition===row.value&&styles.selected]}><Text style={styles.action}>{row.label}</Text></Pressable>)}</View>
      <Text style={styles.label}>Modalidad</Text>
      <View style={styles.choices}>{(['VENTA','DONACION'] as const).map(modality=><Pressable key={modality} accessibilityRole="radio" accessibilityLabel={`Editar modalidad: ${modality==='VENTA'?'Venta':'Donación'}`} accessibilityState={{ checked: draft.modality===modality }} disabled={r.busy} onPress={()=>setDraft({ ...draft,modality,price: modality==='DONACION'?'':draft.price })} style={[styles.button,draft.modality===modality&&styles.selected]}><Text style={styles.action}>{modality==='VENTA'?'Venta':'Donación'}</Text></Pressable>)}</View>
      {draft.modality==='VENTA' && <TextInput accessibilityLabel="Editar precio de venta (CLP)" value={draft.price} editable={!r.busy} onChangeText={price=>setDraft({ ...draft,price })} inputMode="decimal" style={styles.input} />}
      {error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {button('Guardar publicación', ()=>void edit.save())}{button('Cancelar edición', edit.cancel)}
      {button('Recargar datos de edición', edit.reload)}
    </>}
    {confirm && <>
      <Text style={styles.label}>¿Retirar esta publicación?</Text>
      <Text style={styles.text}>Dejará de aparecer en búsquedas y de recibir nuevas solicitudes. Se conservarán sus datos, imágenes y antecedentes de solicitudes y transacciones.</Text>
      {button('Confirmar retirada', ()=>void edit.withdraw())}{button('Cancelar retirada', ()=>setConfirm(false))}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  form: { gap: 12 }, label: { color: '#09243A',fontSize: 16,fontWeight: '600' }, text: { color: '#607485',fontSize: 15,lineHeight: 23 },
  input: { borderColor: '#C8D7E0',borderWidth: 1,borderRadius: 10,padding: 14,fontSize: 16,color: '#09243A' },
  choices: { flexDirection: 'row',flexWrap: 'wrap',gap: 8 },button: { padding: 12,borderRadius: 10,borderWidth: 1,borderColor: '#C8D7E0' },
  selected: { borderColor: '#0B6E75',backgroundColor: '#E3F2F0' },action: { color: '#0B6E75',fontSize: 15 },error: { color: '#AD3029',fontSize: 15 },
});
