import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useActivityParticipants } from '../hooks/useActivityParticipants';

export function ActivityParticipants({ activityId, refreshKey }: { activityId: string; refreshKey: string }) {
  const { data, isLoading, error, refresh, previous, next } = useActivityParticipants(activityId, refreshKey);
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>Personas inscritas{data ? ` (${data.total})` : ''}</Text>
    <View style={styles.rows}>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color="#0B6E75" /><Text style={styles.muted}>Cargando inscritos…</Text></View>
        : error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={refresh} style={styles.button}><Text style={styles.link}>Reintentar</Text></TouchableOpacity></>
        : data?.total === 0 ? <Text style={styles.muted}>Todavía no hay personas inscritas.</Text>
        : data?.participants.map(person => <View key={person.key} style={styles.row}>
          <Text style={styles.name}>{person.name ?? 'Nombre no disponible'}</Text>
        </View>)}
    </View>
    {data && data.total > 0 ? <View style={styles.pagination}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Página anterior de inscritos" disabled={data.page <= 1}
        accessibilityState={{ disabled: data.page <= 1 }} onPress={previous} style={[styles.button, data.page <= 1 && styles.disabled]}>
        <Text style={styles.link}>‹ Anterior</Text>
      </TouchableOpacity>
      <Text accessibilityLiveRegion="polite" style={styles.page}>Página {data.page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Página siguiente de inscritos" disabled={data.page * data.pageSize >= data.total}
        accessibilityState={{ disabled: data.page * data.pageSize >= data.total }} onPress={next}
        style={[styles.button, data.page * data.pageSize >= data.total && styles.disabled]}>
        <Text style={styles.link}>Siguiente ›</Text>
      </TouchableOpacity>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12, marginVertical: 12 }, heading: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  rows: { minHeight: 240 }, row: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#E2E8F0' },
  name: { fontSize: 15, color: '#334155', lineHeight: 22 }, muted: { color: '#64748B', lineHeight: 22 },
  loading: { gap: 12, alignItems: 'center', paddingVertical: 36 }, error: { color: '#9A3412', lineHeight: 22 },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  page: { color: '#64748B', fontSize: 12 }, button: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 4 },
  link: { color: '#0B6E75', fontWeight: '600' }, disabled: { opacity: 0.35 },
});
