import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { PublicationImages } from './PublicationImages';
import { PhysicalgoodsSearchFilters } from './PhysicalgoodsSearchFilters';
import { resourceConditions } from '../types/publication';
import { PhysicalgoodsEditor } from './PhysicalgoodsEditor';
import { PhysicalgoodsRequest } from './PhysicalgoodsRequest';
import { useState } from 'react';
import { ContentReportForm } from '@/features/reports/components/ContentReportForm';

/** Muestra el listado paginado y la galería del recurso seleccionado. */
export function PhysicalgoodsResources({ resources: r }: { resources: ReturnType<typeof usePhysicalgoodsResources> }) {
  const [reporting,setReporting]=useState<{id:string;title:string}|null>(null),[reportBusy,setReportBusy]=useState(false);
  const close=()=>{if(!r.busy&&!reportBusy){setReporting(null);r.close();}};
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button, disabled && styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
  return <View style={styles.card}>
    <Text style={styles.title}>Recursos del campus</Text>
    <PhysicalgoodsSearchFilters resources={r} />
    {r.loading && <ActivityIndicator accessibilityLabel="Cargando recursos" />}
    {r.error && <Text accessibilityRole="alert" style={styles.error}>{r.error}</Text>}
    {button('Actualizar recursos', r.reload, r.loading)}
    {r.page && !r.page.data.length && <Text style={styles.text}>No encontramos recursos disponibles que coincidan con tu búsqueda.</Text>}
    {r.page?.data.map(resource => <View key={resource.id} style={styles.resource}>
      {resource.imageUrl && <Image source={{ uri: resource.imageUrl }} style={styles.thumbnail} accessibilityLabel={`Imagen principal de ${resource.title}`} />}
      <Text style={styles.label}>{resource.title}</Text><Text style={styles.text}>{resource.category.name}</Text>
      <Text style={styles.text}>Condición: {resourceConditions.find(condition => condition.value === resource.condition)?.label}</Text>
      <Text style={styles.text}>{resource.modality === 'DONACION' ? 'Donación' : `Venta · ${resource.price?.toLocaleString('es-CL')} CLP`}</Text>
      {button(`Ver detalle de ${resource.title}`, () => r.open(resource.id))}
    </View>)}
    <View style={styles.choices}>{button('Página anterior', () => r.setNumber(r.number - 1), r.loading || r.number === 1)}{button('Página siguiente', () => r.setNumber(r.number + 1), r.loading || !r.page?.meta.hasMore)}</View>
    {r.page && <Text style={styles.text}>Página {r.page.meta.page}</Text>}
    <Modal visible={Boolean(r.selectedId)} onRequestClose={close} animationType="slide">
      <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
        {button('Cerrar detalle', close, r.busy||reportBusy)}
        {reporting?.id===r.selectedId?<ContentReportForm target={{type:'PUBLICACION_FISICA',publicationId:reporting.id}} title={reporting.title}
          onBusyChange={setReportBusy} onBack={()=>{setReporting(null);r.reloadGallery();}}/>:<>
        {r.galleryLoading && <ActivityIndicator accessibilityLabel="Cargando detalle del recurso" />}
        {r.galleryError && <Text accessibilityRole="alert" style={styles.error}>{r.galleryError}</Text>}
        {button('Actualizar detalle', r.reloadGallery, r.busy || r.galleryLoading)}
        {r.gallery && <>
          <Text style={styles.title}>{r.gallery.title}</Text><Text style={styles.label}>Categoría: {r.gallery.category.name}</Text>
          <Text style={styles.label}>Descripción</Text><Text style={styles.text}>{r.gallery.description}</Text>
          <Text style={styles.text}>Condición: {resourceConditions.find(condition => condition.value === r.gallery!.condition)?.label}</Text>
          <Text style={styles.text}>{r.gallery.modality === 'DONACION' ? 'Modalidad: Donación' : `Modalidad: Venta · ${r.gallery.price?.toLocaleString('es-CL')} CLP`}</Text>
          <Text style={styles.text}>Publicado por: {r.gallery.owner.fullName}</Text>
          <Text style={styles.text}>Campus para el intercambio: {r.gallery.campus.name}</Text>
          <Text style={styles.text}>Estado: {r.gallery.status.toLowerCase()}</Text>
          <Text style={styles.label}>{r.gallery.acceptsRequests ? 'Disponible para recibir solicitudes.' : 'Este recurso no está disponible para recibir solicitudes.'}</Text>
          {button('Denunciar publicación',()=>setReporting({id:r.gallery!.id,title:r.gallery!.title}),r.busy||r.galleryLoading)}
        </>}
        <PhysicalgoodsRequest resources={r} />
        {r.gallery&&<>
          {!r.gallery.images.length && <Text style={styles.text}>No hay fotografías disponibles para este recurso.</Text>}
          {r.gallery.images.map((image, index) => <View key={image.id} style={styles.resource}>
            <Image source={{ uri: image.url }} style={styles.image} accessibilityLabel={`Imagen ${index + 1} de ${r.gallery!.title}`} />
            {image.principal && <Text style={styles.label}>Imagen principal</Text>}
            {r.gallery!.canEdit && <>
              {!image.principal && button(`Hacer principal la imagen ${index + 1}`, () => void r.principal(image.id), r.busy)}
              {button(`Retirar imagen ${index + 1}`, () => void r.retire(image.id), r.busy || r.gallery!.images.length === 1)}
            </>}
          </View>)}
          {r.gallery.canEdit && <>
            <Text style={styles.label}>Agregar imágenes</Text><Text style={styles.text}>JPEG, PNG o WebP · Hasta 5 MB por imagen</Text>
            {button('Seleccionar imágenes adicionales', () => void r.selectPhotos(), r.busy)}
            <PublicationImages photos={r.draftImages} disabled={r.busy} onRemove={r.removeDraft} />
            {button(r.busy ? 'Guardando…' : 'Guardar imágenes adicionales', () => void r.upload(), r.busy || !r.draftImages.length)}
            <Text style={styles.label}>Modificar categoría</Text>
            <View style={styles.choices}>{r.options?.categories.map(category => <Pressable key={category.id} accessibilityRole="radio" accessibilityLabel={`Nueva categoría: ${category.name}`} accessibilityState={{ checked: r.editCategory === category.id, disabled: r.busy }} disabled={r.busy} onPress={() => r.setEditCategory(category.id)} style={[styles.choice, r.editCategory === category.id && styles.selected]}><Text style={styles.action}>{category.name}</Text></Pressable>)}</View>
            {button('Guardar categoría', () => void r.saveCategory(), r.busy || r.editCategory === r.gallery.category.id)}
          </>}
        </>}
        <PhysicalgoodsEditor resources={r} />
        </>}
      </ScrollView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 12, marginTop: 24 },
  modal: { padding: 24, paddingTop: 48, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 14 },
  title: { color: '#09243A', fontSize: 24, fontWeight: '700' }, label: { color: '#09243A', fontSize: 16, fontWeight: '600' },
  text: { color: '#607485', fontSize: 15, lineHeight: 23 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderColor: '#C8D7E0', borderWidth: 1, borderRadius: 10, padding: 10 }, selected: { borderColor: '#0B6E75', backgroundColor: '#E3F2F0' },
  button: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#C8D7E0', marginVertical: 4 }, action: { color: '#0B6E75', fontSize: 15 },
  resource: { borderColor: '#C8D7E0', borderWidth: 1, padding: 14, borderRadius: 12, gap: 8 }, image: { height: 220, width: '100%', resizeMode: 'contain', borderRadius: 10 },
  thumbnail: { width: '100%', height: 160, resizeMode: 'contain', borderRadius: 8, backgroundColor: '#F4F7F9' },
  error: { color: '#AD3029', fontSize: 15, lineHeight: 23 }, disabled: { opacity: 0.5 },
});
