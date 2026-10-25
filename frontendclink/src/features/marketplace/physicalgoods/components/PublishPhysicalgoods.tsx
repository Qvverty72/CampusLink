import { RefreshScrollView } from '@/components/RefreshScrollView';
import { useEffect, useRef, useState } from 'react';
import {useLocalSearchParams} from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePublishPhysicalgoods } from '../hooks/usePublishPhysicalgoods';
import { PHYSICALGOODS_MAX_IMAGES, resourceConditions } from '../types/publication';
import { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import {usePhysicalgoodsRequestCounts} from '../hooks/usePhysicalgoodsRequestCounts';
import { PhysicalgoodsResources } from './PhysicalgoodsResources';
import { PublicationImages } from './PublicationImages';
import { PhysicalgoodsRequests } from './PhysicalgoodsRequests';
import { PhysicalgoodsTransaction } from './PhysicalgoodsTransaction';
import type { PhysicalgoodsTransactionTarget } from '../types/publication';
import {PhysicalgoodsHistory,PhysicalgoodsHistoryDetail} from './PhysicalgoodsHistory';
import type {PhysicalgoodsHistoryTarget} from '../hooks/usePhysicalgoodsHistory';
import { agreementCopy } from '../../utils/agreementPresentation';
import { CatalogTabs, PublishFAB, ScreenHeader } from '../../components/CatalogUI';
import { PublicationSection, PublicationModality, PublicationUpload, PublicationFeedback, PublicationSubmit, publicationUI as f } from '../../components/PublicationFormUI';
import { SearchableFilterSelect } from '../../components/SearchableFilterSelect';
import { orderPhysicalgoodsCategories } from '../utils/orderPhysicalgoodsCategories';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Composición de búsqueda y publicación del módulo de bienes físicos. */
export function PhysicalGoodsScreen() {
  const { identity } = useAuth();
  const {publicationId}=useLocalSearchParams<{publicationId?:string}>();
  const initialPublicationId=typeof publicationId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicationId)?publicationId:undefined;
  return <PhysicalgoodsContent key={`${identity?.userId}:${identity?.campusId}`} initialPublicationId={initialPublicationId} />;
}
/** Mantiene en un flujo común el alta y la recuperación de su publicación. */
function PhysicalgoodsContent({initialPublicationId}:{initialPublicationId?:string}) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const resources = usePhysicalgoodsResources();
  const [view,setView] = useState<'explore'|'publish'|'received'|'sent'|'mine'|'transactions'>('explore');
  const [requestView, setRequestView] = useState<'sent' | 'received'>('sent');
  const publishing=view==='publish',received=view==='received',sent=view==='sent';
  const showRequests = (next: 'sent' | 'received') => { setRequestView(next); setView(next); };
  const personal = view !== 'explore' && !publishing;
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [view]);
  const [agreement,setAgreement]=useState<PhysicalgoodsTransactionTarget|null>(null),[requestsVersion,setRequestsVersion]=useState(0);
  const requestCounters=usePhysicalgoodsRequestCounts(personal,requestsVersion);
  const [historyDetail,setHistoryDetail]=useState<PhysicalgoodsHistoryTarget|null>(null);
  useEffect(()=>{if(initialPublicationId){setView('explore');resources.open(initialPublicationId);}},[initialPublicationId]);
  const refresh=()=>{resources.reload();resources.reloadGallery();setRequestsVersion(value=>value+1);};
  const openAgreement=(publicationId:string,transactionId:string)=>{setHistoryDetail(null);setAgreement({publicationId,transactionId});};
  const openRequest=(publicationId:string,requestId:string)=>setHistoryDetail({publicationId,requestId});
  return <View style={styles.screen}>
    <RefreshScrollView ref={scroll} refreshIndicatorOffset={insets.top + 8} onRefresh={view === 'explore' ? resources.refresh : undefined} refreshing={resources.loading} refreshEnabled={view === 'explore' && !resources.loading && !resources.busy && !resources.selectedId} refreshLabel="los recursos de Mercado" contentContainerStyle={[styles.content, { paddingTop: Math.max(24, insets.top + 16) }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader title={publishing ? 'Publicar recurso' : view === 'transactions' ? agreementCopy.title : received || sent ? 'Mis Solicitudes' : personal ? 'Mis publicaciones' : 'Mercado'}
        subtitle={publishing ? 'Comparte un recurso físico con tu campus' : personal ? 'Tus publicaciones, solicitudes y transacciones' : 'Recursos físicos de tu campus'}
        action={view === 'explore' ? 'Mi actividad' : undefined} onAction={() => setView('mine')}
        onBack={view !== 'explore' ? () => setView('explore') : undefined} />
      {personal && <CatalogTabs variant="underline" selected={received || sent ? 'requests' : view === 'transactions' ? 'transactions' : 'mine'}
        onSelect={tab => { if (tab === 'requests') showRequests(requestView); else setView(tab); }} tabs={[
          { id: 'mine', label: 'Publicaciones' }, { id: 'requests', label: 'Solicitudes',badgeCount:requestCounters.counts?.pendingRequests,badgeLabel:requestCounters.counts?.pendingRequests===1?'solicitud pendiente':'solicitudes pendientes' }, { id: 'transactions', label: agreementCopy.tabTitle,badgeCount:requestCounters.counts?.pendingTransactions,badgeLabel:requestCounters.counts?.pendingTransactions===1?'transacción pendiente':'transacciones pendientes' },
        ]} />}

      <View style={publishing ? undefined : { display: 'none' }}>
        <PublicationForm onPublished={refresh} onGallery={id => { setView('explore'); resources.open(id); }} />
      </View>
      <View style={received?undefined:{display:'none'}}><PhysicalgoodsRequests requestCounters={requestCounters} onModeChange={value => showRequests(value ? 'received' : 'sent')} onExplore={() => setView('explore')} active={received} onResolved={refresh} onAgreement={openAgreement} onDetail={openRequest} refreshVersion={requestsVersion}
        onOpen={id=>{setView('explore');resources.open(id);}} /></View>
      <View style={sent?undefined:{display:'none'}}><PhysicalgoodsRequests requestCounters={requestCounters} onModeChange={value => showRequests(value ? 'received' : 'sent')} onExplore={() => setView('explore')} active={sent} received={false} onResolved={refresh} onAgreement={openAgreement} onDetail={openRequest} refreshVersion={requestsVersion}
        onOpen={id=>{setView('explore');resources.open(id);}} /></View>
      <View style={view==='mine'?undefined:{display:'none'}}><PhysicalgoodsHistory active={view==='mine'} refreshVersion={requestsVersion} onActivityRefresh={requestCounters.reload} onDetail={setHistoryDetail} onAgreement={openAgreement} onRequests={() => showRequests('received')} onPublish={() => setView('publish')} onOpen={id=>{setView('explore');resources.open(id);}} /></View>
      <View style={view==='transactions'?undefined:{display:'none'}}><PhysicalgoodsHistory active={view==='transactions'} transactions showTitle={false} onActivityRefresh={requestCounters.reload} onExplore={() => setView('explore')} refreshVersion={requestsVersion} onDetail={setHistoryDetail} onAgreement={openAgreement} /></View>
      <View style={view!=='explore' ? { display: 'none' } : undefined}><PhysicalgoodsResources resources={resources} onPublish={() => setView('publish')}
        onRequestDetail={(publicationId, requestId) => { resources.close(); openRequest(publicationId, requestId); }} /></View>
    </RefreshScrollView>
    {historyDetail&&<PhysicalgoodsHistoryDetail key={`${historyDetail.publicationId}:${historyDetail.requestId??''}`} target={historyDetail}
      onClose={()=>{setHistoryDetail(null);setRequestsVersion(value=>value+1);}} onAgreement={openAgreement}
      onOpen={id=>{setHistoryDetail(null);setView('explore');resources.open(id);}} />}
    {agreement&&<PhysicalgoodsTransaction key={`${agreement.publicationId}:${agreement.transactionId}`} target={agreement} onOpen={id=>{setAgreement(null);setView('explore');resources.open(id);}} onChanged={refresh}
      onClose={()=>{setAgreement(null);setRequestsVersion(value=>value+1);}} />}
    {view === 'explore' && <PublishFAB onPress={() => setView('publish')} />}
    <BottomNavigationBar activeItemId="physicalgoods" />
  </View>;
}

function PublicationForm({ onPublished, onGallery }: { onPublished: () => void; onGallery: (id: string) => void }) {
  const form = usePublishPhysicalgoods(onPublished);
  const [openField, setOpenField] = useState<'condition' | 'categoryId' | 'careerId' | 'subjectId' | null>(null);
  const { options, loading, busy, created } = form;
  const disabled = busy || form.pickingPhoto;
  if (loading) return <View style={f.section}><ActivityIndicator accessibilityLabel="Cargando opciones de publicación" /><Text style={f.hint}>Preparando tu publicación…</Text></View>;
  if (!options) return <View style={f.section}><PublicationFeedback error={form.error} />
    <PublicationSubmit label="Reintentar opciones" onPress={form.reload} disabled={false} /></View>;
  if (created) return <View style={f.section}>
    <Text accessibilityRole="header" style={f.title}>Recurso publicado</Text>
    {form.photo && <Image source={{ uri: form.photo.uri }} style={styles.photo} accessibilityLabel="Fotografía del recurso publicado" />}
    <Text style={f.title}>{created.title}</Text><Text style={f.hint}>Disponible en {options.campus.name}</Text>
    <Text style={f.label}>{created.modality === 'DONACION' ? 'Donación · Sin costo' : `Venta · ${created.price?.toLocaleString('es-CL')} CLP`}</Text>
    <PublicationFeedback error={form.error} notice={busy ? `Cargando imágenes… Quedan ${form.remaining}.` : form.remaining ? `${form.remaining === 1 ? 'Queda 1 imagen pendiente' : `Quedan ${form.remaining} imágenes pendientes`}. Tu publicación ya está guardada.` : 'Todas las imágenes se guardaron correctamente.'} />
    {form.remaining > 0 && <PublicationSubmit label={busy ? 'Cargando imágenes…' : 'Reintentar imágenes pendientes'} disabled={busy} busy={busy} onPress={() => void form.publish()} />}
    <Pressable accessibilityRole="button" disabled={busy} style={f.secondary} onPress={() => onGallery(created.id)}><Text style={f.actionText}>Ver imágenes publicadas</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} style={f.secondary} onPress={form.reset}><Text style={f.actionText}>Publicar otro recurso</Text></Pressable>
  </View>;
  return <View style={f.form}>
    <Text style={f.hint}>Los campos con * son obligatorios.</Text>
    <PublicationSection number="1" title="Datos del recurso">
      <View style={f.field}><Text style={f.label}>Nombre del recurso *</Text>
        <TextInput accessibilityLabel="Nombre del recurso" placeholder="Ej. Calculadora científica" value={form.title} onChangeText={form.setTitle} maxLength={200} editable={!disabled} style={f.input} /></View>
      <View style={f.field}><Text style={f.label}>Descripción *</Text>
        <TextInput accessibilityLabel="Descripción del recurso" placeholder="Describe el estado, lo que incluye y sus detalles" value={form.description} onChangeText={form.setDescription} maxLength={4000} multiline editable={!disabled} style={[f.input, f.textarea]} /></View>
      <SearchableFilterSelect searchable={false} label="Condición *" options={resourceConditions.map(row => ({ id: row.value, name: row.label }))} value={form.condition}
        onChange={value => form.setCondition(value as typeof form.condition)} disabled={disabled} allowEmpty={false} placeholder="Selecciona una condición"
        expanded={openField === 'condition'} onExpandedChange={open => setOpenField(open ? 'condition' : null)} />
      <SearchableFilterSelect searchable={false} label="Categoría *" options={orderPhysicalgoodsCategories(options.categories)} value={form.categoryId} onChange={form.setCategoryId}
        disabled={disabled} allowEmpty={false} placeholder="Selecciona una categoría"
        expanded={openField === 'categoryId'} onExpandedChange={open => setOpenField(open ? 'categoryId' : null)} />
      {!options.categories.length && <PublicationFeedback error="No hay categorías disponibles para publicar." />}
    </PublicationSection>
    <PublicationSection number="2" title="Modalidad">
      <PublicationModality value={form.modality} onChange={form.setModality} disabled={disabled} />
      {form.modality === 'VENTA' && <View style={f.field}><Text style={f.label}>Precio de venta (CLP) *</Text>
        <TextInput accessibilityLabel="Precio de venta (CLP)" value={form.price} onChangeText={form.setPrice} placeholder="Ej. 15000" inputMode="decimal" maxLength={20} editable={!disabled} style={f.input} /></View>}
    </PublicationSection>
    <PublicationSection number="3" title="Imágenes del recurso" hint={`Al menos una foto · ${form.photos.length}/${PHYSICALGOODS_MAX_IMAGES} seleccionadas. La principal será la portada.`}>
      <PublicationImages photos={form.photos} disabled={disabled} onRemove={form.removePhoto} onPrincipal={form.makePrincipal} />
      <PublicationUpload label="Agregar imágenes" hint={`JPEG, PNG o WebP · Hasta 5 MB por imagen · Máximo ${PHYSICALGOODS_MAX_IMAGES}`} disabled={disabled || form.photos.length >= PHYSICALGOODS_MAX_IMAGES} busy={form.pickingPhoto} onPress={() => void form.choosePhoto()} />
    </PublicationSection>
    <PublicationSection number="4" title="Dónde se comparte" hint="Tu recurso se comparte únicamente dentro de tu campus. La clasificación académica es opcional.">
      <SearchableFilterSelect searchRequired label="Carrera (opcional)" options={options.careers} value={form.careerId} onChange={form.setCareerId}
        disabled={disabled} placeholder="Sin carrera" emptyLabel="Sin carrera" clearLabel="Quitar selección"
        expanded={openField === 'careerId'} onExpandedChange={open => setOpenField(open ? 'careerId' : null)} />
      <SearchableFilterSelect searchRequired label="Asignatura (opcional)" options={options.subjects} value={form.subjectId} onChange={form.setSubjectId}
        disabled={disabled} placeholder="Sin asignatura" emptyLabel="Sin asignatura" clearLabel="Quitar selección"
        expanded={openField === 'subjectId'} onExpandedChange={open => setOpenField(open ? 'subjectId' : null)} />
    </PublicationSection>
    <PublicationFeedback error={form.error} />
    <PublicationSubmit label={busy ? 'Publicando…' : 'Publicar recurso'} disabled={disabled || !options.categories.length || !form.photos.length} busy={busy} onPress={() => { setOpenField(null); void form.publish(); }} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F9' },
  content: { paddingHorizontal: 20, paddingBottom: 190, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 20 },
  photo: { width: '100%', height: 220, borderRadius: 12, resizeMode: 'contain', backgroundColor: '#F4F7F9' },
});
