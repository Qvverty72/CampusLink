import { ActivityIndicator, Text, View } from 'react-native';
import { FileDown, Sheet } from 'lucide-react-native';
import { useReportExport } from '../hooks/useReportExport';
import { AnalyticsButton } from './AnalyticsUI';
import { colors as c, styles as s } from './analytics.styles';

export function ReportExportActions({ reportId }: { reportId: string }) {
  const state = useReportExport(reportId);
  if (!state.allowed) return null;
  return <View style={{ gap: 10 }}>
    <Text style={s.small}>Descarga las cifras de este reporte guardado, sin volver a calcularlas.</Text>
    <View style={s.wrap}>{(['pdf', 'xlsx'] as const).map(format => <AnalyticsButton key={format} secondary
      label={`Descargar reporte ${reportId} en ${format === 'pdf' ? 'PDF' : 'Excel'}`} disabled={!!state.exporting}
      disabledReason={state.exporting ? `Espera a que termine la descarga de ${state.exporting === 'pdf' ? 'PDF' : 'Excel'}.` : undefined} onPress={() => state.exportFile(format)}
      icon={format === 'pdf' ? <FileDown size={17} color={c.PRIMARY} /> : <Sheet size={17} color={c.PRIMARY} />}>
      {`Descargar ${format === 'pdf' ? 'PDF' : 'Excel'}`}
    </AnalyticsButton>)}</View>
    {state.exporting && <View style={s.row}><ActivityIndicator accessibilityLabel={`Preparando ${state.exporting === 'pdf' ? 'PDF' : 'Excel'}`} color={c.PRIMARY} />
      <Text accessibilityLiveRegion="polite" style={s.small}>Preparando {state.exporting === 'pdf' ? 'PDF' : 'Excel'}…</Text></View>}
    {!!state.error && <Text accessibilityRole="alert" style={s.error}>{state.error}</Text>}
  </View>;
}
