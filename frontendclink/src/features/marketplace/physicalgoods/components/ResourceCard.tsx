import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ImageIcon } from 'lucide-react-native';
import { CATALOG_COLORS, PriceTag, ui } from '../../components/CatalogUI';
import { resourceConditions, type PhysicalgoodsResource } from '../types/publication';

export function ResourceCard({ resource, onOpen }: { resource: PhysicalgoodsResource; onOpen: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string|null>(null);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalle de ${resource.title}`} onPress={onOpen} style={styles.card}>
    <View style={styles.photo}>{resource.imageUrl && resource.imageUrl!==failedUrl ? <Image source={{ uri: resource.imageUrl }} onError={() => setFailedUrl(resource.imageUrl??null)}
      style={styles.image} accessibilityLabel={`Imagen principal de ${resource.title}`} /> : <ImageIcon size={30} color={CATALOG_COLORS.secondary} />}</View>
    <View style={styles.info}><Text numberOfLines={2} style={styles.title}>{resource.title}</Text>
      <Text numberOfLines={1} style={styles.condition}>{resourceConditions.find(row => row.value === resource.condition)?.label}</Text>
      <PriceTag modality={resource.modality} price={resource.price} />
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { ...ui.gridCard, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: CATALOG_COLORS.border, overflow: 'hidden' },
  photo: { height: 110, backgroundColor: CATALOG_COLORS.tint, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', resizeMode: 'cover' }, info: { padding: 12, gap: 6 },
  title: { color: CATALOG_COLORS.ink, fontSize: 14, fontWeight: '700', lineHeight: 20, minHeight: 40 },
  condition: { color: CATALOG_COLORS.muted, fontSize: 12, lineHeight: 18 },
});
