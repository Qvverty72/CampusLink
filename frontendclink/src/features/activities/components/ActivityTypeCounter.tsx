import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CalendarDays, UsersRound } from 'lucide-react-native';
import { GlassSurface } from '@/components/GlassSurface';
import { ACTIVITY_COLORS, type Activity } from '../types/activity';

export const ACTIVITY_TYPE_LABELS = {
  OFFICIAL_EVENT: 'Eventos oficiales', COMMUNITY_ACTIVITY: 'Actividades comunitarias',
} as const;
export const ACTIVITY_TYPES = ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const;

const MAP_BADGE_SIZE = 48;
const MAP_ICON_SIZE = 36;

/** Los íconos Lucide son decorativos; el botón padre aporta la etiqueta accesible. */
function ActivityTypeIcon({ type, color }: { type: Activity['type']; color: string }) {
  const Icon = type === 'OFFICIAL_EVENT' ? CalendarDays : UsersRound;
  return <View accessible={false} aria-hidden accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={styles.mapIcon}>
    <Icon size={MAP_ICON_SIZE} color={color} strokeWidth={1.7} />
  </View>;
}

/** Contador/acción compartido por la información del piso y los controles compactos del mapa. */
export function ActivityTypeCounter({ type, count, loading, scope, onPress, variant = 'floor' }: {
  type: Activity['type']; count: number | null; loading: boolean; scope: string;
  onPress: () => void; variant?: 'floor' | 'map';
}) {
  const compact = variant === 'map';
  const color = ACTIVITY_COLORS[type];
  return <TouchableOpacity accessibilityRole="button" activeOpacity={0.75}
    accessibilityLabel={`${ACTIVITY_TYPE_LABELS[type]}${count !== null ? `: ${count}` : ''}. ${loading ? 'Cargando. ' : count === null ? 'Consulta no disponible. Pulsa para reintentar. ' : ''}Ver actividades ${scope}`}
    accessibilityState={{ busy: loading }} aria-busy={loading}
    accessibilityHint={count === null && !loading ? 'Abre el listado para reintentar la consulta.' : undefined}
    onPress={onPress} style={compact ? styles.mapCounter : styles.floorCounter}>
    {compact ? <View style={styles.mapBadge}>
        <GlassSurface radius={MAP_BADGE_SIZE / 2} style={styles.mapSurface}
          contentStyle={[styles.mapSurfaceContent, { borderColor: color }]}>
          <ActivityTypeIcon type={type} color={color} />
        </GlassSurface>
        <GlassSurface radius={12} accessible={false} aria-hidden accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.mapCountBadge}
          contentStyle={[styles.mapCountBadgeContent, { borderColor: color }]}>
          {loading ? <ActivityIndicator size="small" color={color} />
            : <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
              style={[styles.mapNumber, { color, fontSize: Math.min(14, 60 / String(count ?? '—').length) }]}>{count ?? '—'}</Text>}
        </GlassSurface>
      </View> : <View style={[styles.floorBadge, { borderColor: color }]}>
      {loading ? <ActivityIndicator color={color} />
        : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
          style={[styles.floorNumber, { color }]}>{count ?? '—'}</Text>}
    </View>}
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
  mapBadge: { width: MAP_BADGE_SIZE, height: MAP_BADGE_SIZE },
  mapSurface: { width: '100%', height: '100%' },
  mapSurfaceContent: { flex: 1, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapCountBadge: { position: 'absolute', top: -14, right: -4, minWidth: 24, maxWidth: 52, height: 24,
    pointerEvents: 'none', zIndex: 1, elevation: 9 },
  mapCountBadgeContent: { flex: 1, paddingHorizontal: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapNumber: { maxWidth: 42, lineHeight: 18, fontWeight: '500', textAlign: 'center' },
  mapIcon: { width: MAP_ICON_SIZE, height: MAP_ICON_SIZE, pointerEvents: 'none', transform: [{ scale: 0.88 }] },
});
