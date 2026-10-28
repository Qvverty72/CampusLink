import { useState } from 'react';
import { Info } from 'lucide-react-native';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import type { AnalyticalReport } from '../types/dashboard';
import { ANALYTICS_COPY as copy } from '../utils/copy';
import { formatNumber, periodLabel, timestampLabel } from '../utils/presentation';
import { AnalyticsResults, KPI_KINDS, type KpiKind, ReportSummary } from './AnalyticsResults';
import { AnalyticsButton } from './AnalyticsUI';
import { ReportExportActions } from './ReportExportActions';
import { colors as c, styles as s } from './analytics.styles';

function PairedKpi({ reports, kind, columns }: { reports: AnalyticalReport[]; kind: KpiKind; columns: boolean }) {
  const [meaning, setMeaning] = useState(false);
  const definition = copy.kpis[kind];
  return <View style={[s.card, { padding: 16, gap: 8 }]}>
    <View style={s.spread}><Text accessibilityRole="header" style={[s.label, s.grow]}>{definition.title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${copy.meaning} ${definition.title}`} accessibilityState={{ expanded: meaning }} onPress={() => setMeaning(value => !value)} style={s.iconButton}><Info size={19} color={c.PRIMARY} aria-hidden /></Pressable>
    </View>
    <View style={{ flexDirection: columns ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>{reports.map((report, index) => {
      const metric = report[kind];
      return <View key={report.id} style={{ flex: columns ? 1 : undefined, minWidth: 0, gap: 4 }}>
        <Text style={s.label}>Reporte {index ? 'B' : 'A'}</Text>
        <Text selectable style={{ fontSize: 30, lineHeight: 38, fontWeight: '700', color: c.PRIMARY }}>{formatNumber(metric.value)}</Text>
        {metric.value !== null && <Text style={s.small}>{definition.unit}</Text>}
        {metric.value !== null && 'views' in metric && <Text style={s.small}>{formatNumber(metric.views)} vistas · {formatNumber(metric.requests)} solicitudes</Text>}
        <Text style={s.small}>{periodLabel(metric.period)}</Text>
        <Text style={s.small}>{metric.scope.institutionName} · {metric.scope.campusName} · {metric.scope.career?.name ?? copy.allCareers}</Text>
        {metric.value === null && <Text style={s.small}>{copy.states.unavailable}</Text>}
        {metric.value === 0 && <Text style={s.small}>{copy.states.zero}</Text>}
      </View>;
    })}</View>
    {meaning && <View style={s.stack}>
      <Text style={s.body}>{definition.help}</Text>
      {reports.map((report, index) => <View key={report.id} style={{ gap: 4 }}>
        <Text style={s.small}>Reporte {index ? 'B' : 'A'} · {report[kind].period.timeZone}</Text>
        {kind === 'activeUsers' && report.activeUsers.value !== null && <Text style={s.small}>Cierre del período: {timestampLabel(report.activeUsers.period.cutoff, report.activeUsers.period.timeZone)}</Text>}
        {kind === 'activityParticipation' && report.activityParticipation.legacyEvents > 0 && <Text style={s.small}>Este período contiene historial importado parcialmente.</Text>}
      </View>)}
    </View>}
  </View>;
}

/** Empareja valores originales; nunca calcula diferencias entre ámbitos o versiones. */
export function ReportComparison({ reports }: { reports: AnalyticalReport[] }) {
  const { width, fontScale = 1 } = useWindowDimensions();
  const [expanded, setExpanded] = useState<string[]>([]);
  const pairedColumns = width >= 360 && fontScale <= 1.4;
  const first = reports[0], second = reports[1];
  const different = first && second && JSON.stringify([first.scope, first.period.from, first.period.to, first.grouping, first.calculationVersion])
    !== JSON.stringify([second.scope, second.period.from, second.period.to, second.grouping, second.calculationVersion]);
  const differences = first && second ? [JSON.stringify(first.scope) !== JSON.stringify(second.scope) && 'institución, campus o carrera',
    (first.period.from !== second.period.from || first.period.to !== second.period.to) && 'fechas', first.grouping !== second.grouping && 'semanas o meses',
    first.calculationVersion !== second.calculationVersion && 'versión del cálculo'].filter(Boolean).join(' · ') : '';
  return <View style={s.stack}>
    {!!different && <View style={s.notice}><Text accessibilityRole="alert" style={s.body}>Difieren en: {differences}. Revisa el contexto de cada reporte; no representan una variación directa.</Text></View>}
    <View style={{ flexDirection: pairedColumns ? 'row' : 'column', gap: 8, alignItems: 'stretch' }}>{reports.map((report, index) => <View key={report.id} style={pairedColumns ? s.grow : undefined}>
      <Text style={[s.label, { marginBottom: 4 }]}>Reporte {index ? 'B' : 'A'}</Text><ReportSummary report={report} compact exportActions={false} />
    </View>)}</View>
    <Text style={s.small}>Las cifras no se recalculan. Cada par muestra el resultado original de A y B.</Text>
    {KPI_KINDS.map(kind => <PairedKpi key={kind} kind={kind} reports={reports} columns={pairedColumns} />)}
    {reports.map((report, index) => <View key={report.id} style={s.stack}>
      <Text accessibilityRole="header" style={s.label}>Descargar reporte {index ? 'B' : 'A'}</Text>
      <ReportExportActions reportId={report.id} />
      <AnalyticsButton secondary onPress={() => setExpanded(current => current.includes(report.id) ? current.filter(id => id !== report.id) : [...current, report.id])}>
        {`${expanded.includes(report.id) ? 'Ocultar' : 'Explorar'} evolución y asignaturas del reporte ${index ? 'B' : 'A'}`}
      </AnalyticsButton>
      {expanded.includes(report.id) && <AnalyticsResults dashboard={report} showKpis={false} />}
    </View>)}
  </View>;
}
