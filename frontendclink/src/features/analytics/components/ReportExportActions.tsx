import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { FileDown, Sheet } from 'lucide-react-native';
import { useReportExport } from '../hooks/useReportExport';
import { AnalyticsButton } from './AnalyticsUI';
import { colors as c, styles as s } from './analytics.styles';

export function ReportExportActions({ reportId, reportLabel }: { reportId: string; reportLabel?: string }) {
  const state = useReportExport(reportId);
  if (!state.allowed) return null;
  return <View style={[s.card, { gap: 12 }]}>
    <Text accessibilityRole="header" style={s.heading}>Descargar este reporte</Text>
    <Text style={s.small}>Las cifras guardadas, sin volver a calcularlas.</Text>
    {(['pdf', 'xlsx'] as const).map(format => <AnalyticsButton key={format} secondary
      label={`Descargar ${format === 'pdf' ? 'PDF' : 'Excel'}${reportLabel ? ` del ${reportLabel}` : ''}`} disabled={!!state.exporting}
      disabledReason={state.exporting ? `Espera a que termine la descarga de ${state.exporting === 'pdf' ? 'PDF' : 'Excel'}.` : undefined} onPress={() => state.exportFile(format)}
      icon={format === 'pdf' ? <FileDown size={17} color={c.PRIMARY} /> : <Sheet size={17} color={c.PRIMARY} />}>
      {`Descargar ${format === 'pdf' ? 'PDF' : 'Excel'}`}
    </AnalyticsButton>)}
    {state.exporting && <View style={s.row}><ActivityIndicator accessibilityLabel={`Preparando ${state.exporting === 'pdf' ? 'PDF' : 'Excel'}`} color={c.PRIMARY} />
      <Text accessibilityLiveRegion="polite" style={[s.small, s.grow]}>{state.phase === 'delivery' ? Platform.OS === 'web' ? 'Iniciando descarga…' : 'Abriendo opciones para compartir…' : `Preparando archivo ${state.exporting === 'pdf' ? 'PDF' : 'Excel'}…`}</Text></View>}
    {!!state.notice && <Text accessibilityLiveRegion="polite" style={s.small}>{state.notice}</Text>}
    {!!state.error && <Text accessibilityRole="alert" style={s.error}>{state.error}</Text>}
  </View>;
}
