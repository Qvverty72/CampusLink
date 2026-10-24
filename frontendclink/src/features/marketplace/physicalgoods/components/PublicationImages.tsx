import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PublicationPhoto } from '../types/publication';
import { CATALOG_COLORS as c } from '../../components/CatalogUI';

export function PublicationImages({ photos, disabled, onRemove, onPrincipal }: {
  photos: PublicationPhoto[]; disabled: boolean; onRemove: (index: number) => void; onPrincipal?: (index: number) => void;
}) {
  return <View style={styles.list}>{photos.map((photo, index) => <View key={`${photo.uri}:${index}`} style={styles.item}>
    <Image source={{ uri: photo.uri }} style={styles.image} accessibilityLabel={`Vista previa de imagen ${index + 1}`} />
    {onPrincipal && <Text style={styles.label}>{index === 0 ? 'Imagen principal' : `Imagen ${index + 1}`}</Text>}
    <View style={styles.actions}>
      {onPrincipal && index > 0 && <Pressable accessibilityRole="button" disabled={disabled} style={styles.button} onPress={() => onPrincipal(index)}><Text style={styles.action}>Usar imagen {index + 1} como principal</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={disabled} style={styles.button} onPress={() => onRemove(index)}><Text style={styles.remove}>Quitar imagen {index + 1}</Text></Pressable>
    </View>
  </View>)}</View>;
}
const styles = StyleSheet.create({
  list: { gap: 12 }, item: { borderColor: '#C8D7E0', borderWidth: 1, padding: 12, borderRadius: 12, gap: 10 },
  image: { height: 160, width: '100%', resizeMode: 'contain', backgroundColor: '#F4F7F9', borderRadius: 8 },
  label: { color: c.primary, fontWeight: '700' }, actions: { gap: 4 }, button: { minHeight: 44, justifyContent: 'center' },
  action: { color: c.primary, fontWeight: '600' }, remove: { color: '#AD3029', fontWeight: '600' },
});
