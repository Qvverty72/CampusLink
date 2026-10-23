import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReportExport } from '../hooks/useReportExport';

export function ReportExportActions({ reportId }: { reportId: string }) {
  const state = useReportExport(reportId);
  if (!state.allowed) return null;
  return <View style={styles.container}>
    <Text style={styles.note}>Exporta esta instantánea con sus cifras originales.</Text>
    <View style={styles.actions}>
      {(['pdf', 'xlsx'] as const).map(format => <Pressable key={format} accessibilityRole="button"
        accessibilityLabel={`Exportar reporte ${reportId} en ${format === 'pdf' ? 'PDF' : 'Excel'}`}
        disabled={Boolean(state.exporting)} style={[styles.button, Boolean(state.exporting) && styles.disabled]}
        onPress={() => state.exportFile(format)}><Text style={styles.buttonText}>Exportar {format === 'pdf' ? 'PDF' : 'Excel'}</Text></Pressable>)}
    </View>
    {state.exporting && <ActivityIndicator accessibilityLabel={`Preparando ${state.exporting === 'pdf' ? 'PDF' : 'Excel'}`} />}
    {Boolean(state.error) && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 10 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { backgroundColor: '#0B6E75', borderRadius: 10, padding: 13, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' }, disabled: { opacity: 0.55 },
  note: { color: '#607485', fontSize: 12, lineHeight: 18 }, error: { color: '#A12626' },
});
