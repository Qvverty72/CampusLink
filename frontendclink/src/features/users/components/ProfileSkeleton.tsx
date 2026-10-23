import { StyleSheet, View } from 'react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { APP_COLORS } from '@/types/colors';

/** Solo sustituye los datos académicos pendientes; la identidad ya conocida sigue disponible. */
export function ProfileAcademicSkeleton() {
  return <Skeleton label="Cargando perfil académico" style={styles.academic} contentStyle={styles.chips}>
    <SkeletonBlock width="38%" height={28} borderRadius={20} style={styles.darkBlock} />
    <SkeletonBlock width="48%" height={28} borderRadius={20} style={styles.darkBlock} />
  </Skeleton>;
}

/** Badge circular de carga; conserva la campana disponible y no representa un número. */
export function ProfileNotificationCountSkeleton() {
  return <Skeleton label="Cargando contador de notificaciones" style={styles.notificationBadge}>
    <SkeletonBlock width={16} height={16} borderRadius={8} />
  </Skeleton>;
}

/** Misma geometría de las tarjetas, sin acciones ni contadores ficticios durante carga o recarga. */
export function ProfilePersonalCardsSkeleton() {
  return <Skeleton label="Cargando resumen del perfil" contentStyle={styles.section}>
    {[0, 1].map(row => <View key={row} style={styles.row}>
      {[0, 1].map(column => <View key={column} style={styles.card}>
        <View style={styles.top}><SkeletonBlock width={38} height={38} borderRadius={12} /><SkeletonBlock width="36%" height={16} borderRadius={10} /></View>
        <View style={styles.lines}><SkeletonBlock width="88%" height={18} /><SkeletonBlock width="72%" height={12} /></View>
      </View>)}
    </View>)}
    <View style={styles.wide}>
      <SkeletonBlock width={38} height={38} borderRadius={12} />
      <View style={styles.wideLines}><SkeletonBlock width="60%" height={18} /><SkeletonBlock width="88%" height={12} /><SkeletonBlock width="40%" height={10} /></View>
    </View>
  </Skeleton>;
}

const styles = StyleSheet.create({
  academic: { width: '100%' }, chips: { flexDirection: 'row', gap: 8 }, darkBlock: { backgroundColor: '#FFFFFF26' },
  notificationBadge: { position: 'absolute', top: 1, right: 0, width: 20, height: 20, borderRadius: 12, borderWidth: 2,
    borderColor: APP_COLORS.PRIMARY, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  section: { gap: 12, marginTop: 4 }, row: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minWidth: 0, minHeight: 150, padding: 14, gap: 18, borderRadius: 18, backgroundColor: '#FFFFFF' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, lines: { gap: 10 },
  wide: { minHeight: 96, padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 12, alignItems: 'center' },
  wideLines: { flex: 1, gap: 8 },
});
