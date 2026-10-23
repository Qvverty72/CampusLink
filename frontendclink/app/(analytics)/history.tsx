import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { AnalyticsResults } from '@/features/analytics/components/AnalyticsResults';
import { useHistoricalReports } from '@/features/analytics/hooks/useHistoricalReports';
import type { HistoricalReportsFilters } from '@/features/analytics/types/dashboard';

export default function HistoricalReportsScreen() {
  const history = useHistoricalReports();
  const [draft, setDraft] = useState<HistoricalReportsFilters>({});
  const institution = history.options?.institutions[0];
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Link href="/(analytics)/analytics" style={styles.link}>Volver al tablero</Link>
      <Text accessibilityRole="header" style={styles.title}>Reportes históricos</Text>
      <Text style={styles.note}>Consulta las cifras y parámetros guardados. Abre un reporte y selecciona otro para comparar sus resultados.</Text>
      {!history.allowed ? <Text accessibilityRole="alert" style={styles.error}>Necesitas permiso de reportería para consultar el historial.</Text> : <>
        <View style={styles.card}>
          <Text style={styles.label}>Ámbito: {institution?.name ?? 'Tu institución'}</Text>
          <Text style={styles.note}>Sin selección de campus se incluyen todos tus ámbitos autorizados, también los históricos.</Text>
          {institution?.campuses.map(campus => {
            const checked = Boolean(draft.campusIds?.includes(campus.id));
            return <Pressable key={campus.id} accessibilityRole="checkbox" accessibilityState={{ checked }}
              style={[styles.option, checked && styles.selected]} onPress={() => setDraft({ ...draft,
                campusIds: checked ? draft.campusIds!.filter(id => id !== campus.id) : [...(draft.campusIds ?? []), campus.id] })}>
              <Text>{campus.name}</Text>
            </Pressable>;
          })}
          <Text style={styles.label}>Carrera</Text>
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: !draft.careerId }} style={[styles.option, !draft.careerId && styles.selected]}
            onPress={() => setDraft({ ...draft, careerId: undefined })}><Text>Todas las carreras</Text></Pressable>
          {institution?.careers.map(career => <Pressable key={career.id} accessibilityRole="radio" accessibilityState={{ selected: draft.careerId === career.id }}
            style={[styles.option, draft.careerId === career.id && styles.selected]} onPress={() => setDraft({ ...draft, careerId: career.id })}><Text>{career.name}</Text></Pressable>)}
          <Text style={styles.label}>Período desde (opcional, AAAA-MM-DD)</Text>
          <TextInput accessibilityLabel="Inicio del período histórico" placeholder="AAAA-MM-DD" value={draft.from ?? ''} onChangeText={from => setDraft({ ...draft, from })} style={styles.input} />
          <Text style={styles.label}>Período hasta (opcional, AAAA-MM-DD)</Text>
          <TextInput accessibilityLabel="Fin del período histórico" placeholder="AAAA-MM-DD" value={draft.to ?? ''} onChangeText={to => setDraft({ ...draft, to })} style={styles.input} />
          <Text style={styles.note}>Se muestran reportes cuyo período coincide total o parcialmente con estas fechas.</Text>
          {([undefined, 'week', 'month'] as const).map(grouping => <Pressable key={grouping ?? 'all'} accessibilityRole="radio"
            accessibilityState={{ selected: draft.grouping === grouping }} style={[styles.option, draft.grouping === grouping && styles.selected]}
            onPress={() => setDraft({ ...draft, grouping })}><Text>{grouping === 'week' ? 'Semanal' : grouping === 'month' ? 'Mensual' : 'Todas las agrupaciones'}</Text></Pressable>)}
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => history.search(draft)}><Text style={styles.buttonText}>Buscar reportes</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.option} onPress={() => { setDraft({}); history.search({}); }}><Text>Limpiar filtros</Text></Pressable>
        </View>
        {history.loading && <ActivityIndicator accessibilityLabel="Cargando historial" />}
        {Boolean(history.error) && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{history.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => history.search()}><Text style={styles.link}>Reintentar historial</Text></Pressable></View>}
        {history.page?.items.length === 0 && <Text style={styles.note}>No hay reportes guardados para los filtros seleccionados.</Text>}
        {history.page?.items.map(report => <View key={report.id} style={styles.card}>
          <Text style={styles.label}>{report.scope.institutionName} · {report.scope.campuses.map(campus => campus.name).join(', ')}</Text>
          <Text>{report.period.from} al {report.period.to} · {report.grouping === 'week' ? 'Semanal' : 'Mensual'}</Text>
          <Text>Carrera: {report.scope.career?.name ?? 'Sin filtro de carrera'}</Text>
          <Text>Generado el {new Intl.DateTimeFormat('es-CL', { timeZone: report.period.timeZone, dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date(report.generatedAt))} · {report.period.timeZone}</Text>
          <Text>Responsable: {report.generatedBy.name}</Text>
          <Text style={styles.note}>Identificador: {report.id}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => history.open(report.id)}><Text style={styles.buttonText}>Abrir reporte</Text></Pressable>
          {history.selectedIds.length > 0 && history.selectedIds[0] !== report.id && <Pressable accessibilityRole="button" style={styles.option} onPress={() => history.open(report.id, true)}><Text>Comparar con el reporte abierto</Text></Pressable>}
        </View>)}
        {history.page?.nextCursor && <Pressable accessibilityRole="button" style={styles.button} onPress={history.nextPage}><Text style={styles.buttonText}>Siguiente página</Text></Pressable>}
        {history.hasPrevious && <Pressable accessibilityRole="button" style={styles.option} onPress={() => history.search()}><Text>Volver a la primera página</Text></Pressable>}
        {history.selectedIds.length > 0 && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>{history.selectedIds.length > 1 ? 'Comparación de instantáneas' : 'Instantánea guardada'}</Text>
          <Text style={styles.note}>Cada reporte conserva su ámbito, período y versión de cálculo. Las cifras no se recalculan.</Text>
          <Pressable accessibilityRole="button" onPress={history.close}><Text style={styles.link}>Cerrar reportes</Text></Pressable>
        </View>}
        {history.detailLoading && <ActivityIndicator accessibilityLabel="Abriendo instantáneas" />}
        {Boolean(history.detailError) && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{history.detailError}</Text>
          <Pressable accessibilityRole="button" onPress={history.retryDetail}><Text style={styles.link}>Reintentar apertura</Text></Pressable></View>}
        {history.reports.map((report, index) => <View key={report.id} style={styles.results}>
          <Text accessibilityRole="header" style={styles.label}>Reporte {index + 1} · {report.id}</Text>
          <AnalyticsResults dashboard={report} report={report} />
        </View>)}
      </>}
    </ScrollView>
    <BottomNavigationBar />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F9' },
  content: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 115, gap: 14 },
  title: { color: '#09243A', fontSize: 30, fontWeight: '800' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 12 },
  results: { gap: 12 }, label: { color: '#345267', fontWeight: '800' },
  note: { color: '#607485', fontSize: 13, lineHeight: 20 },
  link: { color: '#0B6E75', fontWeight: '700', paddingVertical: 8 },
  input: { borderWidth: 1, borderColor: '#CBD9E0', borderRadius: 10, padding: 10, color: '#09243A' },
  option: { borderWidth: 1, borderColor: '#CBD9E0', borderRadius: 10, padding: 10 },
  selected: { borderColor: '#0B6E75', backgroundColor: '#E6F4F2' },
  button: { backgroundColor: '#0B6E75', borderRadius: 10, padding: 13, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' }, error: { color: '#A12626' },
});
