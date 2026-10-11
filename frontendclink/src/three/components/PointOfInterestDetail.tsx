import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PointOfInterestDefinition } from '../types/map';
import { poiTypeLabel } from '../utils/pointOfInterest';

/** Uses the floor modal's stable container and already authorized active-map data. */
export function PointOfInterestDetail({ poi, buildingName, floorName, onBack }: {
  poi: PointOfInterestDefinition; buildingName: string; floorName: string; onBack: () => void;
}) {
  return <View style={styles.content}>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
      <Text style={styles.link}>‹ Volver a la información del piso</Text>
    </Pressable>
    <View style={styles.summary}>
      <Text accessibilityRole="header" style={styles.name}>{poi.name}</Text>
      <Text style={styles.type}>{poiTypeLabel(poi.type)}</Text>
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>Información del lugar</Text>
      <Text selectable style={styles.text}>{poi.description?.trim() || 'Aún no hay información adicional de este lugar.'}</Text>
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>Ubicación</Text>
      <Text style={styles.text}>Edificio: {buildingName}</Text>
      <Text style={styles.text}>Piso: {floorName}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  back: { paddingVertical: 10 },
  link: { color: '#0B6E75', fontSize: 14, fontWeight: '600' },
  summary: { gap: 8, alignItems: 'center' },
  name: { color: '#0F172A', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  type: { color: '#64748B', fontSize: 14, textAlign: 'center' },
  section: { gap: 10 },
  heading: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  text: { color: '#475569', fontSize: 14, lineHeight: 22 },
});
