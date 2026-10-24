import { FileText } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CATALOG_COLORS, PriceTag, StatusTag } from '../../components/CatalogUI';
import type { DigitalPublication } from '../types/publication';

export function ResourceRow({ resource, onOpen, recommended = false }: { resource: DigitalPublication; onOpen: () => void; recommended?: boolean }) {
  const academic = [resource.careers[0]?.name, resource.subjects[0]?.name].filter(Boolean).join(' · ');
  return <Pressable accessibilityRole="button" accessibilityLabel={`${recommended ? 'Consultar recomendado' : 'Consultar'} ${resource.title}`}
    onPress={onOpen} style={[styles.row, recommended && styles.recommended]}>
    <View style={[styles.thumbnail, recommended && styles.recommendedThumbnail]}><FileText size={26} color={CATALOG_COLORS.primary} /><Text style={styles.fileType}>{resource.files[0]?.mimeType === 'application/pdf' ? 'PDF' : 'Archivo'}</Text></View>
    <View style={styles.info}><Text numberOfLines={2} style={styles.title}>{resource.title}</Text><Text numberOfLines={recommended ? 2 : 1} style={styles.academic}>{academic || resource.campusName}</Text>
      <View style={styles.tags}><PriceTag modality={resource.modality} price={resource.price} />{resource.acquired && <StatusTag neutral>Ya lo tienes</StatusTag>}</View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  row: { borderRadius: 16, borderWidth: 1, borderColor: CATALOG_COLORS.border, padding: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnail: { width: 56, height: 68, backgroundColor: CATALOG_COLORS.tint, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  fileType: { fontSize: 11, fontWeight: '700', color: CATALOG_COLORS.secondary }, info: { flex: 1, minWidth: 0, gap: 6 },
  title: { fontSize: 14, fontWeight: '700', lineHeight: 20, color: CATALOG_COLORS.ink }, academic: { fontSize: 12, lineHeight: 17, color: CATALOG_COLORS.muted }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  recommended: { width: 150, flexDirection: 'column', alignItems: 'stretch', gap: 10 }, recommendedThumbnail: { width: '100%', height: 70 },
});
