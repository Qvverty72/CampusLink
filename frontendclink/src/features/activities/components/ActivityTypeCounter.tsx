import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ACTIVITY_COLORS, type Activity } from '../types/activity';

export const ACTIVITY_TYPE_LABELS = {
  OFFICIAL_EVENT: 'Eventos oficiales', COMMUNITY_ACTIVITY: 'Actividades comunitarias',
} as const;
export const ACTIVITY_TYPES = ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const;

const MAP_COUNTER_THEME = {
  OFFICIAL_EVENT: { color: ACTIVITY_COLORS.OFFICIAL_EVENT, countBackground: '#DBEAFE' },
  COMMUNITY_ACTIVITY: { color: ACTIVITY_COLORS.COMMUNITY_ACTIVITY, countBackground: '#FFEDD5' },
} as const;
const MAP_BADGE_SIZE = 48;

/** Small outline icons built from native strokes, without an extra icon library. */
function ActivityTypeIcon({ type, color }: { type: Activity['type']; color: string }) {
  return <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={styles.mapIcon}>
    {type === 'OFFICIAL_EVENT' ? <>
      <View style={[styles.calendarOutline, { borderColor: color }]} />
      <View style={[styles.calendarBinding, { left: 10, backgroundColor: color }]} />
      <View style={[styles.calendarBinding, { right: 10, backgroundColor: color }]} />
      <View style={[styles.calendarDivider, { backgroundColor: color }]} />
      <View style={[styles.calendarDate, { backgroundColor: color }]} />
    </> : <>
      <View style={[styles.personHead, { left: 4, top: 8, borderColor: color }]} />
      <View style={[styles.personHead, { right: 4, top: 8, borderColor: color }]} />
      <View style={[styles.personShoulders, { left: 1, borderColor: color }]} />
      <View style={[styles.personShoulders, { right: 1, borderColor: color }]} />
    </>}
  </View>;
}

/** One count/action shared by floor information and the map's compact controls. */
export function ActivityTypeCounter({ type, count, loading, scope, onPress, variant = 'floor' }: {
  type: Activity['type']; count: number | null; loading: boolean; scope: string;
  onPress: () => void; variant?: 'floor' | 'map';
}) {
  const compact = variant === 'map';
  const color = compact ? MAP_COUNTER_THEME[type].color : ACTIVITY_COLORS[type];
  return <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
    accessibilityLabel={`${ACTIVITY_TYPE_LABELS[type]}${count !== null ? `: ${count}` : ''}. ${loading ? 'Cargando. ' : count === null ? 'Consulta no disponible. Pulsa para reintentar. ' : ''}Ver actividades ${scope}`}
    accessibilityState={{ busy: loading }} aria-busy={loading}
    accessibilityHint={count === null && !loading ? 'Abre el listado para reintentar la consulta.' : undefined}
    onPress={onPress} style={compact ? styles.mapCounter : styles.floorCounter}>
    <View style={[compact ? styles.mapBadge : styles.floorBadge, { borderColor: color }]}>
      {compact ? <>
        <ActivityTypeIcon type={type} color={color} />
        <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.mapCountBadge, { borderColor: color, backgroundColor: MAP_COUNTER_THEME[type].countBackground }]}>
          {loading ? <ActivityIndicator size="small" color={color} />
            : <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
              style={[styles.mapNumber, { color, fontSize: Math.min(14, 60 / String(count ?? '—').length) }]}>{count ?? '—'}</Text>}
        </View>
      </> : loading ? <ActivityIndicator color={color} />
        : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
          style={[styles.floorNumber, { color }]}>{count ?? '—'}</Text>}
    </View>
    {!compact ? <><Text style={[styles.floorLabel, { color }]}>{ACTIVITY_TYPE_LABELS[type]}</Text>
      <Text style={styles.floorHint}>Ver actividades</Text></> : null}
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  floorCounter: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, padding: 10, borderRadius: 16, backgroundColor: '#F8FAFC' },
  floorBadge: { alignSelf: 'center', width: 48, height: 48, borderRadius: 24, borderWidth: 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  floorNumber: { fontSize: 20, fontWeight: '700' },
  floorLabel: { width: '100%', minHeight: 40, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  floorHint: { width: '100%', fontSize: 12, color: '#64748B', textAlign: 'center' },
  mapCounter: { width: 64, paddingTop: 14, alignItems: 'center' },
  mapBadge: { width: MAP_BADGE_SIZE, height: MAP_BADGE_SIZE, borderRadius: MAP_BADGE_SIZE / 2, borderWidth: 1,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 5, elevation: 2 },
  mapCountBadge: { position: 'absolute', top: -14, right: -4, minWidth: 24, maxWidth: 52, height: 24,
    paddingHorizontal: 4, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  mapNumber: { maxWidth: 42, lineHeight: 18, fontWeight: '500', textAlign: 'center' },
  mapIcon: { width: 36, height: 36, transform: [{ scale: 0.88 }] },
  calendarOutline: { position: 'absolute', left: 5, top: 6, width: 26, height: 27, borderWidth: 2.5, borderRadius: 4 },
  calendarBinding: { position: 'absolute', top: 2, width: 3, height: 10, borderRadius: 1.5 },
  calendarDivider: { position: 'absolute', left: 7, top: 14, width: 22, height: 2.5 },
  calendarDate: { position: 'absolute', left: 11, top: 21, width: 6, height: 5, borderRadius: 1 },
  personHead: { position: 'absolute', top: 3, width: 11, height: 11, borderWidth: 2.5, borderRadius: 5.5 },
  personShoulders: { position: 'absolute', top: 20, width: 16, height: 12, borderWidth: 2.5, borderBottomWidth: 0,
    borderTopLeftRadius: 8, borderTopRightRadius: 8 },
});
