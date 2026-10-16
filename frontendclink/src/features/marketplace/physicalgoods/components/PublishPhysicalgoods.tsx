import { useEffect,useState } from 'react';
import {useLocalSearchParams} from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePublishPhysicalgoods } from '../hooks/usePublishPhysicalgoods';
import { PHYSICALGOODS_MAX_IMAGES, resourceConditions } from '../types/publication';
import { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { PhysicalgoodsResources } from './PhysicalgoodsResources';
import { PublicationImages } from './PublicationImages';
import { PhysicalgoodsRequests } from './PhysicalgoodsRequests';
import { PhysicalgoodsTransaction } from './PhysicalgoodsTransaction';
import type { PhysicalgoodsTransactionTarget } from '../types/publication';
import {PhysicalgoodsHistory,PhysicalgoodsHistoryDetail} from './PhysicalgoodsHistory';
import type {PhysicalgoodsHistoryTarget} from '../hooks/usePhysicalgoodsHistory';

/** Composición de búsqueda y publicación del módulo de bienes físicos. */
export function PhysicalGoodsScreen() {
  const { identity, session } = useAuth();
  const {publicationId}=useLocalSearchParams<{publicationId?:string}>();
  const initialPublicationId=typeof publicationId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicationId)?publicationId:undefined;
  return <PhysicalgoodsContent key={`${identity?.userId}:${identity?.campusId}:${session?.access_token}`} initialPublicationId={initialPublicationId} />;
}
/** Mantiene en un flujo común el alta y la recuperación de su publicación. */
function PhysicalgoodsContent({initialPublicationId}:{initialPublicationId?:string}) {
  const resources = usePhysicalgoodsResources();
  const [view,setView] = useState<'explore'|'publish'|'received'|'sent'|'mine'|'transactions'>('explore');
  const publishing=view==='publish',received=view==='received',sent=view==='sent';
  const [agreement,setAgreement]=useState<PhysicalgoodsTransactionTarget|null>(null),[requestsVersion,setRequestsVersion]=useState(0);
  const [historyDetail,setHistoryDetail]=useState<PhysicalgoodsHistoryTarget|null>(null);
  useEffect(()=>{if(initialPublicationId){setView('explore');resources.open(initialPublicationId);}},[initialPublicationId]);
  const refresh=()=>{resources.reload();resources.reloadGallery();setRequestsVersion(value=>value+1);};
  const openAgreement=(publicationId:string,transactionId:string)=>{setHistoryDetail(null);setAgreement({publicationId,transactionId});};
  const openRequest=(publicationId:string,requestId:string)=>setHistoryDetail({publicationId,requestId});
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>MARKETPLACE</Text>
      <Text style={styles.title}>Marketplace</Text>
      <Text style={styles.description}>Busca, vende o dona recursos físicos en tu campus.</Text>
      <View style={styles.choices}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: view==='explore' }} style={view==='explore' ? styles.button : styles.secondaryButton} onPress={() => setView('explore')}><Text style={view==='explore' ? styles.buttonText : styles.action}>Explorar recursos</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: publishing }} style={publishing ? styles.button : styles.secondaryButton} onPress={() => setView('publish')}><Text style={publishing ? styles.buttonText : styles.action}>Publicar un recurso</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: received }} style={received ? styles.button : styles.secondaryButton} onPress={() => setView('received')}><Text style={received ? styles.buttonText : styles.action}>Solicitudes recibidas</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: sent }} style={sent ? styles.button : styles.secondaryButton} onPress={() => setView('sent')}><Text style={sent ? styles.buttonText : styles.action}>Mis solicitudes</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{selected:view==='mine'}} style={view==='mine'?styles.button:styles.secondaryButton} onPress={()=>setView('mine')}><Text style={view==='mine'?styles.buttonText:styles.action}>Mis publicaciones</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{selected:view==='transactions'}} style={view==='transactions'?styles.button:styles.secondaryButton} onPress={()=>setView('transactions')}><Text style={view==='transactions'?styles.buttonText:styles.action}>Mis transacciones</Text></Pressable>
      </View>
      <View style={publishing ? undefined : { display: 'none' }}>
        <PublicationForm onPublished={refresh} onGallery={id => { setView('explore'); resources.open(id); }} />
      </View>
      <View style={received?undefined:{display:'none'}}><PhysicalgoodsRequests active={received} onResolved={refresh} onAgreement={openAgreement} onDetail={openRequest} refreshVersion={requestsVersion}
        onOpen={id=>{setView('explore');resources.open(id);}} /></View>
      <View style={sent?undefined:{display:'none'}}><PhysicalgoodsRequests active={sent} received={false} onResolved={refresh} onAgreement={openAgreement} onDetail={openRequest} refreshVersion={requestsVersion}
        onOpen={id=>{setView('explore');resources.open(id);}} /></View>
      <View style={view==='mine'?undefined:{display:'none'}}><PhysicalgoodsHistory active={view==='mine'} refreshVersion={requestsVersion} onDetail={setHistoryDetail} onAgreement={openAgreement} /></View>
      <View style={view==='transactions'?undefined:{display:'none'}}><PhysicalgoodsHistory active={view==='transactions'} transactions refreshVersion={requestsVersion} onDetail={setHistoryDetail} onAgreement={openAgreement} /></View>
      <View style={view!=='explore' ? { display: 'none' } : undefined}><PhysicalgoodsResources resources={resources} /></View>
    </ScrollView>
    {historyDetail&&<PhysicalgoodsHistoryDetail key={`${historyDetail.publicationId}:${historyDetail.requestId??''}`} target={historyDetail}
      onClose={()=>{setHistoryDetail(null);setRequestsVersion(value=>value+1);}} onAgreement={openAgreement}
      onOpen={id=>{setHistoryDetail(null);setView('explore');resources.open(id);}} />}
    {agreement&&<PhysicalgoodsTransaction key={`${agreement.publicationId}:${agreement.transactionId}`} target={agreement} onChanged={refresh}
      onClose={()=>{setAgreement(null);setRequestsVersion(value=>value+1);}} />}
    <BottomNavigationBar activeItemId="physicalgoods" />
  </View>;
}

function PublicationForm({ onPublished, onGallery }: { onPublished: () => void; onGallery: (id: string) => void }) {
  const form = usePublishPhysicalgoods(onPublished);
  const { options, loading, busy, created } = form;
  const choice = (label: string, selected: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="radio"
    accessibilityLabel={label} accessibilityState={{ checked: selected, disabled: busy }} disabled={busy} onPress={onPress}
    style={[styles.choice, selected && styles.selected, busy && styles.disabled]}><Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text></Pressable>;
  if (loading) return <ActivityIndicator style={styles.loading} accessibilityLabel="Cargando opciones de publicación" />;
  if (!options) return <View style={styles.card}>
    <Text accessibilityRole="alert" style={styles.error}>{form.error}</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={form.reload}><Text style={styles.buttonText}>Reintentar</Text></Pressable>
  </View>;
  if (created) return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.cardTitle}>Recurso publicado</Text>
    {form.photo && <Image source={{ uri: form.photo.uri }} style={styles.photo} accessibilityLabel="Fotografía del recurso publicado" />}
    <Text style={styles.label}>{created.title}</Text>
    <Text style={styles.description}>Disponible en {options.campus.name}</Text>
    <Text style={styles.description}>{created.modality === 'DONACION' ? 'Donación' : `Venta · ${created.price?.toLocaleString('es-CL')} CLP`}</Text>
    {busy && <Text style={styles.description}>Cargando imágenes… Quedan {form.remaining}.</Text>}
    {form.error && <Text accessibilityRole="alert" style={styles.error}>{form.error}</Text>}
    {form.remaining > 0 && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void form.publish()} style={styles.secondaryButton}><Text style={styles.action}>Reintentar imágenes pendientes</Text></Pressable>}
    <Pressable accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={() => onGallery(created.id)}><Text style={styles.action}>Ver imágenes publicadas</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={form.reset}><Text style={styles.buttonText}>Publicar otro recurso</Text></Pressable>
  </View>;
  return <View style={styles.card}>
    <Text style={styles.campus}>Campus: {options.campus.name}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={form.reload}><Text style={styles.action}>Actualizar opciones</Text></Pressable>
    <Text style={styles.label}>Nombre del recurso</Text>
    <TextInput accessibilityLabel="Nombre del recurso" placeholder="Ej. Calculadora científica" value={form.title} onChangeText={form.setTitle} maxLength={200} editable={!busy} style={styles.input} />
    <Text style={styles.label}>Imágenes del recurso ({form.photos.length}/{PHYSICALGOODS_MAX_IMAGES})</Text>
    <PublicationImages photos={form.photos} disabled={busy} onRemove={form.removePhoto} onPrincipal={form.makePrincipal} />
    <Pressable accessibilityRole="button" disabled={busy || form.photos.length >= PHYSICALGOODS_MAX_IMAGES} onPress={() => void form.choosePhoto()}
      style={[styles.secondaryButton, (busy || form.photos.length >= PHYSICALGOODS_MAX_IMAGES) && styles.disabled]}>
      <Text style={styles.action}>Agregar imágenes</Text>
    </Pressable>
    <Text style={styles.hint}>Máximo {PHYSICALGOODS_MAX_IMAGES} imágenes · JPEG, PNG o WebP · Máximo 5 MB por imagen · Elige una principal</Text>
    <Text style={styles.label}>Descripción</Text>
    <TextInput accessibilityLabel="Descripción del recurso" placeholder="Describe el recurso y lo que incluye" value={form.description} onChangeText={form.setDescription} maxLength={4000} multiline editable={!busy} style={[styles.input, styles.textarea]} />
    <Text style={styles.label}>Condición</Text>
    <View style={styles.choices}>{resourceConditions.map(row => choice(row.label, form.condition === row.value, () => form.setCondition(row.value)))}</View>
    <Text style={styles.label}>Categoría</Text>
    <Text style={styles.hint}>Tipo de objeto físico que publicas.</Text>
    <View style={styles.choices}>{options.categories.map(row => choice(row.name, form.categoryId === row.id, () => form.setCategoryId(row.id)))}</View>
    {!options.categories.length && <Text style={styles.error}>No hay categorías disponibles para publicar.</Text>}
    <Text style={styles.label}>Modalidad</Text>
    <View style={styles.choices}>{choice('Venta', form.modality === 'VENTA', () => form.setModality('VENTA'))}{choice('Donación', form.modality === 'DONACION', () => form.setModality('DONACION'))}</View>
    {form.modality === 'VENTA' && <>
      <Text style={styles.label}>Precio de venta (CLP)</Text>
      <TextInput accessibilityLabel="Precio de venta (CLP)" value={form.price} onChangeText={form.setPrice} placeholder="Ej. 15000" inputMode="decimal" editable={!busy} style={styles.input} />
    </>}
    <Text style={styles.label}>Carrera (opcional)</Text>
    <View style={styles.choices}>{choice('Sin carrera', !form.careerId, () => form.setCareerId(''))}
      {options.careers.map(row => choice(row.name, form.careerId === row.id, () => form.setCareerId(row.id)))}</View>
    <Text style={styles.label}>Asignatura (opcional)</Text>
    <View style={styles.choices}>{choice('Sin asignatura', !form.subjectId, () => form.setSubjectId(''))}
      {options.subjects.map(row => choice(row.name, form.subjectId === row.id, () => form.setSubjectId(row.id)))}</View>
    {form.error && <Text accessibilityRole="alert" style={styles.error}>{form.error}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !options.categories.length }} disabled={busy || !options.categories.length}
      style={[styles.button, (busy || !options.categories.length) && styles.disabled]} onPress={() => void form.publish()}>
      <Text style={styles.buttonText}>{busy ? 'Publicando…' : 'Publicar recurso'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F9' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 120, width: '100%', maxWidth: 760, alignSelf: 'center' },
  eyebrow: { color: '#0B6E75', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  title: { color: '#09243A', fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  description: { color: '#607485', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 12, marginTop: 24 },
  cardTitle: { color: '#09243A', fontSize: 24, fontWeight: '700' },
  campus: { color: '#0B6E75', fontSize: 16, fontWeight: '700' },
  label: { color: '#09243A', fontSize: 16, fontWeight: '600', marginTop: 8 },
  input: { borderColor: '#C8D7E0', borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16, color: '#09243A' },
  textarea: { minHeight: 112, textAlignVertical: 'top' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderColor: '#C8D7E0', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  selected: { borderColor: '#0B6E75', backgroundColor: '#E3F2F0' },
  choiceText: { color: '#607485', fontSize: 15 },
  selectedText: { color: '#0B6E75', fontWeight: '700' },
  photo: { width: '100%', height: 220, borderRadius: 12, resizeMode: 'contain', backgroundColor: '#F4F7F9' },
  button: { backgroundColor: '#0B6E75', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#0B6E75', alignItems: 'center' },
  action: { color: '#0B6E75', fontSize: 16, fontWeight: '600' },
  hint: { color: '#607485', fontSize: 13 },
  error: { color: '#AD3029', fontSize: 15, lineHeight: 23 },
  disabled: { opacity: 0.5 },
  loading: { marginTop: 40 },
});
