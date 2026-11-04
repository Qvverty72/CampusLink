import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { UserRound } from 'lucide-react-native';
import { APP_COLORS } from '@/types/colors';

export function ActivityParticipantCount({ count, loading = false, isJoined = false }: {
  count?: number; loading?: boolean; isJoined?: boolean;
}) {
  const valid = count !== undefined && Number.isSafeInteger(count) && count >= 0;
  return <View style={styles.container} accessibilityLiveRegion="polite">
    <View style={styles.icon} accessible={false} aria-hidden accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <UserRound size={22} color={APP_COLORS.SECONDARY} strokeWidth={1.7} />
    </View>
    {loading ? <ActivityIndicator size="small" /> : <Text style={styles.count}>{valid ? count : '—'}</Text>}
    <Text style={styles.label}>
      {loading ? 'Cargando inscritos…' : valid ? 'Inscritos' : 'Inscritos: no disponible'}
      {!loading && isJoined ? <Text style={styles.joined}> (estás inscrito)</Text> : null}
    </Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  icon: { width: 22, height: 22, pointerEvents: 'none' }, count: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  label: { fontSize: 14, color: '#64748B' },
  joined: { color: APP_COLORS.PRIMARY, fontWeight: '500' },
});
