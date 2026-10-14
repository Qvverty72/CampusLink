import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PublicationPhoto } from '../types/publication';

export function PublicationImages({ photos, disabled, onRemove, onPrincipal }: {
  photos: PublicationPhoto[]; disabled: boolean; onRemove: (index: number) => void; onPrincipal?: (index: number) => void;
}) {
  return <View style={styles.list}>{photos.map((photo, index) => <View key={`${photo.uri}:${index}`} style={styles.item}>
    <Image source={{ uri: photo.uri }} style={styles.image} accessibilityLabel={`Vista previa de imagen ${index + 1}`} />
    {onPrincipal && <Text style={styles.label}>{index === 0 ? 'Imagen principal' : `Imagen ${index + 1}`}</Text>}
    <View style={styles.actions}>
      {onPrincipal && index > 0 && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onPrincipal(index)}><Text style={styles.action}>Usar imagen {index + 1} como principal</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => onRemove(index)}><Text style={styles.remove}>Quitar imagen {index + 1}</Text></Pressable>
    </View>
  </View>)}</View>;
}
const styles = StyleSheet.create({
  list: { gap: 12 }, item: { borderColor: '#C8D7E0', borderWidth: 1, padding: 12, borderRadius: 12, gap: 10 },
  image: { height: 160, width: '100%', resizeMode: 'contain', backgroundColor: '#F4F7F9', borderRadius: 8 },
  label: { color: '#09243A', fontWeight: '700' }, actions: { gap: 8 }, action: { color: '#0B6E75', paddingVertical: 8 }, remove: { color: '#AD3029', paddingVertical: 8 },
});
