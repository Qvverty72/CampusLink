import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAnalyticsDashboard } from '@/features/analytics/hooks/useAnalyticsDashboard';
import type { DashboardGrouping } from '@/features/analytics/types/dashboard';

import { Link } from 'expo-router';
import { AnalyticsResults } from '@/features/analytics/components/AnalyticsResults';

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;
/** Opciones autorizadas y períodos calculados por API, comunes a los cuatro indicadores. */
export default function AnalyticsScreen() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [grouping, setGrouping] = useState<DashboardGrouping>('month');
  const { dashboard: liveDashboard, report, reportRequested, generateReport, loading, error, consult, options, filters, selectFilters } = useAnalyticsDashboard({ from, to });
  const dashboard = report ?? liveDashboard;
  const institution = options?.institutions.find(row => row.id === filters?.institutionId);
  const careers = institution?.careers.filter(row => row.campusIds.some(id => filters?.campusIds.includes(id))) ?? [];

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CAMPUSLINK · REPORTERÍA</Text>
      <Text style={styles.title}>Tablero de indicadores</Text>
      <Link href="/(analytics)/history" style={styles.scope}>Consultar reportes históricos</Link>
      <Text style={styles.description}>Selecciona tus sedes autorizadas y una carrera opcional. Cada cifra indica el período y ámbito usado.</Text>
      <View style={styles.filters}>
        <Text style={styles.label}>Institución</Text>
        {options?.institutions.map(row => <Pressable key={row.id} accessibilityRole="radio" accessibilityState={{ selected: row.id === filters?.institutionId }}
          onPress={() => selectFilters({ institutionId: row.id, campusIds: [row.campuses[0].id] })} style={[styles.option, row.id === filters?.institutionId && styles.selected]}>
          <Text style={styles.optionText}>{row.name}</Text>
        </Pressable>)}
        <Text style={styles.label}>Campus (uno o varios)</Text>
        {institution?.campuses.map(row => {
          const selected = filters!.campusIds.includes(row.id);
          return <Pressable key={row.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
            onPress={() => {
              const campusIds = selected ? filters!.campusIds.filter(id => id !== row.id) : [...filters!.campusIds, row.id];
              const careerId = institution.careers.find(c => c.id === filters?.careerId && c.campusIds.some(id => campusIds.includes(id)))?.id;
              selectFilters({ institutionId: institution.id, campusIds, careerId });
            }} style={[styles.option, selected && styles.selected]}>
            <Text style={styles.optionText}>{selected ? '☑' : '☐'} {row.name}</Text>
          </Pressable>;
        })}
        {filters && filters.campusIds.length === 0 && <Text accessibilityRole="alert" style={styles.error}>Selecciona al menos un campus.</Text>}
        {institution && <>
          <Text style={styles.label}>Carrera</Text>
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: !filters?.careerId }}
            onPress={() => selectFilters({ ...filters!, careerId: undefined })} style={[styles.option, !filters?.careerId && styles.selected]}>
            <Text style={styles.optionText}>Todas las carreras / sin filtro de carrera</Text>
          </Pressable>
          {careers.map(row => <Pressable key={row.id} accessibilityRole="radio" accessibilityState={{ selected: row.id === filters?.careerId }}
            onPress={() => selectFilters({ ...filters!, careerId: row.id })} style={[styles.option, row.id === filters?.careerId && styles.selected]}>
            <Text style={styles.optionText}>{row.name}</Text>
          </Pressable>)}
        </>}
        <View style={styles.field}><Text style={styles.label}>Desde (America/Santiago)</Text><TextInput accessibilityLabel="Fecha inicial" value={from} onChangeText={setFrom} placeholder="AAAA-MM-DD" style={styles.input} autoCapitalize="none" /></View>
        <View style={styles.field}><Text style={styles.label}>Hasta (America/Santiago)</Text><TextInput accessibilityLabel="Fecha final" value={to} onChangeText={setTo} placeholder="AAAA-MM-DD" style={styles.input} autoCapitalize="none" /></View>
        <Text style={styles.label}>Agrupar por</Text>
        {(['week', 'month'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: grouping === value }}
          onPress={() => setGrouping(value)} style={[styles.option, grouping === value && styles.selected]}>
          <Text style={styles.optionText}>{value === 'week' ? 'Semana (lunes a domingo)' : 'Mes calendario'}</Text>
        </Pressable>)}
        <Text style={styles.note}>Referencia institucional: America/Santiago. Hasta 260 intervalos por consulta.</Text>
        <Pressable accessibilityRole="button" disabled={Boolean(filters && !filters.campusIds.length)} onPress={() => consult(from, to, grouping)} style={styles.button}><Text style={styles.buttonText}>{error ? 'Reintentar consulta' : 'Consultar'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={loading || !filters?.campusIds.length} onPress={() => generateReport(from, to, grouping)} style={styles.button}>
          <Text style={styles.buttonText}>{reportRequested && error ? 'Reintentar reporte' : 'Generar reporte'}</Text>
        </Pressable>
      </View>
      {loading && <ActivityIndicator accessibilityLabel={reportRequested ? 'Generando reporte' : 'Cargando indicadores'} color="#0B6E75" style={styles.loading} />}
      {Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!loading && dashboard && <AnalyticsResults dashboard={dashboard} report={report} />}
    </ScrollView>
    <BottomNavigationBar />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F9' },
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 115, gap: 14 },
  eyebrow: { color: '#0B6E75', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#09243A', fontSize: 30, fontWeight: '800' },
  description: { color: '#607485', fontSize: 15, lineHeight: 22 },
  filters: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 12 },
  field: { gap: 5 }, label: { color: '#345267', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#CBD9E0', borderRadius: 10, padding: 10, color: '#09243A' },
  button: { backgroundColor: '#0B6E75', borderRadius: 10, padding: 13, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  option: { borderWidth: 1, borderColor: '#CBD9E0', borderRadius: 10, padding: 10 },
  selected: { borderColor: '#0B6E75', backgroundColor: '#E6F4F2' },
  optionText: { color: '#09243A' },
  loading: { marginTop: 30 }, error: { color: '#A12626', padding: 12 },
  scope: { color: '#345267', fontWeight: '700', marginTop: 8 },
  note: { color: '#607485', fontSize: 12, lineHeight: 18 },
});
