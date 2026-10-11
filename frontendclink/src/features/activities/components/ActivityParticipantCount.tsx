import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export function ActivityParticipantCount({ count, loading = false }: { count?: number; loading?: boolean }) {
  const valid = count !== undefined && Number.isSafeInteger(count) && count >= 0;
  return <View style={styles.container} accessibilityLiveRegion="polite">
    <Text accessible={false} style={styles.icon}>👤</Text>
    {loading ? <ActivityIndicator size="small" /> : <Text style={styles.count}>{valid ? count : '—'}</Text>}
    <Text style={styles.label}>{loading ? 'Cargando inscritos…' : valid ? 'Inscritos' : 'Inscritos: no disponible'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  icon: { fontSize: 22 }, count: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  label: { fontSize: 14, color: '#64748B' },
});
