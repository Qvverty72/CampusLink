import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { PublicationImages } from './PublicationImages';

export function PhysicalgoodsResources({ resources: r }: { resources: ReturnType<typeof usePhysicalgoodsResources> }) {
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button, disabled && styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
  return <View style={styles.card}>
    <Text style={styles.title}>Recursos del campus</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: r.mine }} onPress={() => r.setMine(!r.mine)}><Text style={styles.action}>{r.mine ? '☑' : '☐'} Solo mis publicaciones</Text></Pressable>
    <Text style={styles.label}>Filtrar por categoría</Text>
    <View style={styles.choices}>{[{ id: '', name: 'Todas las categorías' }, ...(r.options?.categories ?? [])].map(category => <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ checked: r.category === category.id }} accessibilityLabel={`Filtro: ${category.name}`} onPress={() => r.setCategory(category.id)} style={[styles.choice, r.category === category.id && styles.selected]}><Text style={styles.action}>{category.name}</Text></Pressable>)}</View>
    {r.loading && <ActivityIndicator accessibilityLabel="Cargando recursos" />}
    {r.error && <Text accessibilityRole="alert" style={styles.error}>{r.error}</Text>}
    {button('Actualizar recursos', r.reload, r.loading)}
    {r.page && !r.page.data.length && <Text style={styles.text}>No hay publicaciones para este filtro.</Text>}
    {r.page?.data.map(resource => <View key={resource.id} style={styles.resource}>
      <Text style={styles.label}>{resource.title}</Text><Text style={styles.text}>{resource.category.name}</Text>
      <Text style={styles.text}>{resource.modality === 'DONACION' ? 'Donación' : `Venta · ${resource.price?.toLocaleString('es-CL')} CLP`}</Text>
      {button(`Ver imágenes de ${resource.title}`, () => r.open(resource.id))}
    </View>)}
    <View style={styles.choices}>{button('Página anterior', () => r.setNumber(r.number - 1), r.loading || r.number === 1)}{button('Página siguiente', () => r.setNumber(r.number + 1), r.loading || !r.page?.meta.hasMore)}</View>
    <Modal visible={Boolean(r.selectedId)} onRequestClose={r.close} animationType="slide">
      <ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
        {button('Cerrar imágenes', r.close, r.busy)}
        {r.galleryLoading && <ActivityIndicator accessibilityLabel="Cargando imágenes" />}
        {r.galleryError && <Text accessibilityRole="alert" style={styles.error}>{r.galleryError}</Text>}
        {button('Actualizar imágenes', r.reloadGallery, r.busy || r.galleryLoading)}
        {r.gallery && <>
          <Text style={styles.title}>{r.gallery.title}</Text><Text style={styles.label}>Categoría: {r.gallery.category.name}</Text>
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
  error: { color: '#AD3029', fontSize: 15, lineHeight: 23 }, disabled: { opacity: 0.5 },
});
