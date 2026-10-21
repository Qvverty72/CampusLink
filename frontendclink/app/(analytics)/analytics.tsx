import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { loadDashboard, type DashboardData, type DashboardMetric } from '@/features/analytics/api/dashboardApi';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const number = (value: number) => new Intl.NumberFormat('es-CL').format(value);

function KpiCard({ title, metric, children }: { title: string; metric: DashboardMetric; children?: ReactNode }) {
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.value}>{number(metric.value)}</Text>
    {children}
    <Text style={styles.cardMeta}>{metric.scope.institutionName} · {metric.scope.campusName}</Text>
    <Text style={styles.cardMeta}>{metric.period.from} al {metric.period.to} · UTC</Text>
  </View>;
}

/** F2.7-02: resumen para el campus de la sesión y un intervalo civil UTC. */
export default function AnalyticsScreen() {
  const { identity } = useAuth();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identity?.capabilities.reports) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadDashboard(range.from, range.to, controller.signal)
      .then(setDashboard)
      .catch(problem => {
        if (!controller.signal.aborted) {
          setDashboard(null);
          setError(problem?.serverMessage ?? 'No se pudo cargar el tablero.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [identity?.campusId, identity?.capabilities.reports, range]);

  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CAMPUSLINK · REPORTERÍA</Text>
      <Text style={styles.title}>Tablero de indicadores</Text>
      <Text style={styles.description}>Consulta el campus de tu sesión. Cada cifra indica el período y ámbito usado.</Text>
      <View style={styles.filters}>
        <View style={styles.field}><Text style={styles.label}>Desde (UTC)</Text><TextInput accessibilityLabel="Fecha inicial" value={from} onChangeText={setFrom} placeholder="AAAA-MM-DD" style={styles.input} autoCapitalize="none" /></View>
        <View style={styles.field}><Text style={styles.label}>Hasta (UTC)</Text><TextInput accessibilityLabel="Fecha final" value={to} onChangeText={setTo} placeholder="AAAA-MM-DD" style={styles.input} autoCapitalize="none" /></View>
        <Pressable accessibilityRole="button" onPress={() => setRange({ from, to })} style={styles.button}><Text style={styles.buttonText}>Consultar</Text></Pressable>
      </View>
      {loading && <ActivityIndicator accessibilityLabel="Cargando indicadores" color="#0B6E75" style={styles.loading} />}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!loading && dashboard && <>
        <Text style={styles.scope}>{dashboard.scope.institutionName} · {dashboard.scope.campusName}</Text>
        <KpiCard title="Usuarios activos al corte" metric={dashboard.activeUsers}>
          <Text style={styles.detail}>Estado al inicio del día siguiente a {dashboard.period.to} (UTC).</Text>
        </KpiCard>
        <KpiCard title="Demanda de recursos" metric={dashboard.resourceDemand}>
          <Text style={styles.detail}>{number(dashboard.resourceDemand.views)} vistas · {number(dashboard.resourceDemand.requests)} solicitudes</Text>
        </KpiCard>
        <KpiCard title="Demanda de asignaturas" metric={dashboard.subjectDemand}>
          {dashboard.subjectDemand.subjects.length === 0 ? <Text style={styles.detail}>Sin interacciones de recursos con asignatura.</Text> :
            dashboard.subjectDemand.subjects.map(subject => <Text key={subject.subjectId} style={styles.detail}>
              {subject.subjectName}: {number(subject.views)} vistas · {number(subject.requests)} solicitudes
            </Text>)}
          <Text style={styles.note}>Un recurso vinculado a varias asignaturas cuenta en cada una.</Text>
        </KpiCard>
        <KpiCard title="Participación en actividades" metric={dashboard.activityParticipation}>
          <Text style={styles.detail}>Inscripciones registradas; no representa asistencia presencial.</Text>
        </KpiCard>
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
  loading: { marginTop: 30 }, error: { color: '#A12626', padding: 12 },
  scope: { color: '#345267', fontWeight: '700', marginTop: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 8 },
  cardTitle: { color: '#345267', fontWeight: '800', fontSize: 16 },
  value: { color: '#09243A', fontWeight: '800', fontSize: 35 },
  detail: { color: '#1C4055', fontSize: 14, lineHeight: 21 },
  note: { color: '#607485', fontSize: 12, lineHeight: 18 },
  cardMeta: { color: '#607485', fontSize: 12 },
});
