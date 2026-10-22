import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAnalyticsDashboard } from '@/features/analytics/hooks/useAnalyticsDashboard';
import type { DashboardMetric } from '@/features/analytics/types/dashboard';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const number = (value: number) => new Intl.NumberFormat('es-CL').format(value);

function KpiCard({ title, metric, children }: { title: string; metric: DashboardMetric; children?: ReactNode }) {
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.value}>{number(metric.value)}</Text>
    {children}
    <Text style={styles.cardMeta}>{metric.scope.institutionName} · {metric.scope.campusName}</Text>
    {metric.scope.career && <Text style={styles.cardMeta}>Carrera: {metric.scope.career.name}</Text>}
    <Text style={styles.cardMeta}>{metric.period.from} al {metric.period.to} · UTC</Text>
  </View>;
}

/** F2.7-03: opciones autorizadas por API y filtros comunes a los cuatro indicadores. */
export default function AnalyticsScreen() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const { dashboard, loading, error, consult, options, filters, selectFilters } = useAnalyticsDashboard({ from, to });
  const institution = options?.institutions.find(row => row.id === filters?.institutionId);
  const careers = institution?.careers.filter(row => row.campusIds.some(id => filters?.campusIds.includes(id))) ?? [];

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CAMPUSLINK · REPORTERÍA</Text>
      <Text style={styles.title}>Tablero de indicadores</Text>
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
        <View style={styles.field}><Text style={styles.label}>Desde (UTC)</Text><TextInput accessibilityLabel="Fecha inicial" value={from} onChangeText={setFrom} placeholder="AAAA-MM-DD" style={styles.input} autoCapitalize="none" /></View>
        <View style={styles.field}><Text style={styles.label}>Hasta (UTC)</Text><TextInput accessibilityLabel="Fecha final" value={to} onChangeText={setTo} placeholder="AAAA-MM-DD" style={styles.input} autoCapitalize="none" /></View>
        <Pressable accessibilityRole="button" disabled={Boolean(filters && !filters.campusIds.length)} onPress={() => consult(from, to)} style={styles.button}><Text style={styles.buttonText}>{error ? 'Reintentar consulta' : 'Consultar'}</Text></Pressable>
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Cargando indicadores" color="#0B6E75" style={styles.loading} />}
      {Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!loading && dashboard && <>
        <Text style={styles.scope}>{dashboard.scope.institutionName} · {dashboard.scope.campusName}</Text>
        <KpiCard title="Usuarios activos al corte" metric={dashboard.activeUsers}>
          <Text style={styles.detail}>Estado al cierre de {dashboard.period.to} (UTC), según la auditoría de cuentas.</Text>
        </KpiCard>
        <KpiCard title="Demanda de recursos" metric={dashboard.resourceDemand}>
          <Text style={styles.detail}>{number(dashboard.resourceDemand.views)} vistas · {number(dashboard.resourceDemand.requests)} solicitudes</Text>
          <Text style={styles.note}>Total de interacciones: vistas + solicitudes.</Text>
        </KpiCard>
        <KpiCard title="Demanda de asignaturas" metric={dashboard.subjectDemand}>
          <Text style={styles.detail}>{number(dashboard.subjectDemand.views)} vistas · {number(dashboard.subjectDemand.requests)} solicitudes</Text>
          {dashboard.subjectDemand.subjects.length === 0 ? <Text style={styles.detail}>Sin interacciones de recursos con asignatura.</Text> :
            dashboard.subjectDemand.subjects.map(subject => <Text key={subject.subjectId} style={styles.detail}>
              {subject.subjectName}: {number(subject.views)} vistas · {number(subject.requests)} solicitudes
            </Text>)}
          <Text style={styles.note}>Total de interacciones por asignatura. Un recurso vinculado a varias asignaturas cuenta en cada una.</Text>
        </KpiCard>
        <KpiCard title="Participación en actividades" metric={dashboard.activityParticipation}>
          <Text style={styles.detail}>Inscripciones registradas; no representa asistencia presencial.</Text>
          {dashboard.activityParticipation.legacyEvents > 0 && <Text style={styles.note}>Este período contiene historial importado parcialmente.</Text>}
        </KpiCard>
        {dashboard.notes.map(note => <Text key={note} style={styles.note}>{note}</Text>)}
      </>}
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
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 8 },
  cardTitle: { color: '#345267', fontWeight: '800', fontSize: 16 },
  value: { color: '#09243A', fontWeight: '800', fontSize: 35 },
  detail: { color: '#1C4055', fontSize: 14, lineHeight: 21 },
  note: { color: '#607485', fontSize: 12, lineHeight: 18 },
  cardMeta: { color: '#607485', fontSize: 12 },
});
