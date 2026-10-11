import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ACTIVITY_COLORS, type Activity } from '../types/activity';

export const ACTIVITY_TYPE_LABELS = {
  OFFICIAL_EVENT: 'Eventos oficiales', COMMUNITY_ACTIVITY: 'Actividades comunitarias',
} as const;
export const ACTIVITY_TYPES = ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const;

const MAP_COUNTER_SURFACES = {
  OFFICIAL_EVENT: { backgroundColor: '#F8FAFF', borderColor: '#DCE6FA' },
  COMMUNITY_ACTIVITY: { backgroundColor: '#FFFAF5', borderColor: '#F0E1D1' },
} as const;

/** One count/action shared by floor information and the map's compact controls. */
export function ActivityTypeCounter({ type, count, loading, scope, onPress, variant = 'floor' }: {
  type: Activity['type']; count: number | null; loading: boolean; scope: string;
  onPress: () => void; variant?: 'floor' | 'map';
}) {
  const color = ACTIVITY_COLORS[type];
  const compact = variant === 'map';
  return <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
    accessibilityLabel={`${ACTIVITY_TYPE_LABELS[type]}${count !== null ? `: ${count}` : ''}. ${loading ? 'Cargando. ' : count === null ? 'Consulta no disponible. Pulsa para reintentar. ' : ''}Ver actividades ${scope}`}
    accessibilityState={{ busy: loading }} aria-busy={loading}
    accessibilityHint={count === null && !loading ? 'Abre el listado para reintentar la consulta.' : undefined}
    onPress={onPress} style={compact ? styles.mapCounter : styles.floorCounter}>
    <View style={[styles.floorBadge, { borderColor: color }, compact && styles.mapBadge, compact && MAP_COUNTER_SURFACES[type]]}>
      {loading ? <ActivityIndicator color={color} />
        : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
          style={[compact ? styles.mapNumber : styles.floorNumber, { color }]}>{count ?? '—'}</Text>}
    </View>
    <Text numberOfLines={compact ? 1 : undefined} adjustsFontSizeToFit={compact} minimumFontScale={0.8}
      style={[compact ? styles.mapLabel : styles.floorLabel, { color }]}>
      {compact ? type === 'OFFICIAL_EVENT' ? 'Oficiales' : 'Comunitarias' : ACTIVITY_TYPE_LABELS[type]}
    </Text>
    {!compact ? <Text style={styles.floorHint}>Ver actividades</Text> : null}
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  floorCounter: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, padding: 10, borderRadius: 16, backgroundColor: '#F8FAFC' },
  floorBadge: { alignSelf: 'center', width: 48, height: 48, borderRadius: 24, borderWidth: 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  floorNumber: { fontSize: 20, fontWeight: '700' },
  floorLabel: { width: '100%', minHeight: 40, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  floorHint: { width: '100%', fontSize: 12, color: '#64748B', textAlign: 'center' },
  mapCounter: { width: 84, minHeight: 86, alignItems: 'center', gap: 6 },
  mapBadge: { width: 64, height: 64, borderRadius: 32, borderWidth: 1,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  mapNumber: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  mapLabel: { width: '100%', fontSize: 11, lineHeight: 16, fontWeight: '500', textAlign: 'center' },
});
