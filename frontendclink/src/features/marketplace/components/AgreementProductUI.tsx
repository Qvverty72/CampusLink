import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ImageIcon } from 'lucide-react-native';
import { CATALOG_COLORS as colors } from './CatalogUI';
import { AgreementStepModal } from './AgreementStepModal';
import { detailUI } from './ResourceDetailUI';
import { agreementCopy as copy } from '../utils/agreementPresentation';

/** Contenedor de consulta compartido; no añade navegación ni permisos al recurso. */
export function AgreementProductModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return <AgreementStepModal title={copy.product} closeLabel={copy.closeProduct} onClose={onClose}>{children}</AgreementStepModal>;
}

/** Fotografías de solo lectura, reutilizables sin importar DTO de physicalgoods. */
export function AgreementProductGallery({ title, images }: { title: string; images: { id: string; url: string; principal?: boolean }[] }) {
  const [selected, setSelected] = useState<string | null>(null), [failed, setFailed] = useState<string | null>(null);
  const photo = images.find(row => row.id === selected) ?? images.find(row => row.principal) ?? images[0];
  return <View style={{ gap: 10 }}>
    <View style={styles.hero}>{photo && failed !== photo.url
      ? <Image key={photo.url} source={{ uri: photo.url }} resizeMode="contain" accessibilityLabel={`${title}. ${copy.photo(images.indexOf(photo) + 1, images.length)}`} style={styles.photo} onError={() => setFailed(photo.url)} />
      : <><ImageIcon size={32} color={colors.secondary} /><Text style={detailUI.helper}>{copy.noPhotos}</Text></>}
    </View>
    {images.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {images.map((row, index) => <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={copy.photo(index + 1, images.length)}
        accessibilityState={{ selected: row.id === photo?.id }} onPress={() => { setSelected(row.id); setFailed(null); }} style={[styles.thumbnail, row.id === photo?.id && styles.selected]}>
        <Image source={{ uri: row.url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Pressable>)}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  hero: { height: 200, borderRadius: 16, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' }, thumbnail: { width: 60, height: 60, borderRadius: 12, padding: 4, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.tint },
  selected: { borderColor: colors.primary },
});
