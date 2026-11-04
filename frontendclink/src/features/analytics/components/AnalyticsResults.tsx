import { useState } from 'react';
import { ChevronDown, ChevronUp, FileCheck2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { AnalyticalReport, DashboardData, DashboardMetrics } from '../types/dashboard';
import { formatNumber as number, groupingLabel, periodLabel, savedReportPeriodLabel, savedReportTimeLabel, savedTimestampLabel, shortGroupingLabel } from '../utils/presentation';
import { ANALYTICS_COPY as copy } from '../utils/copy';
import { AnalyticsTrends, SubjectDemand } from './AnalyticsTrends';
import { ReportExportActions } from './ReportExportActions';
import { colors as c, styles as s } from './analytics.styles';

export const KPI_KINDS = ['activeUsers', 'resourceDemand', 'subjectDemand', 'activityParticipation'] as const;
export type KpiKind = typeof KPI_KINDS[number];
const definitions = copy.kpis;

/** Cada tarjeta conserva metadatos propios, también en las comparaciones. */
export function KpiCard({ kind, metrics }: { kind: KpiKind; metrics: DashboardMetrics }) {
  const [meaning, setMeaning] = useState(false);
  const { fontScale = 1 } = useWindowDimensions();
  const metric = metrics[kind], definition = definitions[kind];
  const scope = `${metric.scope.institutionName} · ${metric.scope.campusName} · ${metric.scope.career?.name ?? copy.allCareers}`;
  const period = periodLabel(metric.period);
  return <View style={[s.card, k.card]}>
    <View style={[k.main, fontScale > 1.4 && k.mainLarge]}>
      <View style={[s.grow, { flexBasis: 110 }]}><Text accessibilityRole="header" style={s.label}>{definition.title}</Text><Text style={s.small}>{period}</Text></View>
      <View style={k.amount}><Text selectable style={k.value}>{number(metric.value)}</Text>{metric.value !== null && <Text style={s.small}>{definition.unit}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${meaning ? 'Contraer' : 'Expandir'} tarjeta ${definition.title}`} accessibilityHint={`Definición y contexto: ${scope}. ${period}.`} accessibilityState={{ expanded: meaning }} aria-expanded={meaning} onPress={() => setMeaning(value => !value)} style={k.expandButton}>
        {meaning ? <ChevronUp size={20} color={c.PRIMARY} aria-hidden /> : <ChevronDown size={20} color={c.PRIMARY} aria-hidden />}
      </Pressable>
    </View>
    {metric.value !== null && 'views' in metric && <View style={k.counts}>
      <Text style={s.small}><Text style={k.count}>{number(metric.views)}</Text> vistas</Text>
      <Text style={s.small}><Text style={k.count}>{number(metric.requests)}</Text> solicitudes</Text>
    </View>}
    {metric.value === null && <Text style={s.small}>{copy.states.unavailable}</Text>}
    {metric.value === 0 && <Text style={s.small}>{copy.states.zero}</Text>}
    {meaning && <View style={k.details}>
      <Text style={s.body}>{definition.help}</Text>
      {kind === 'activityParticipation' && metrics.activityParticipation.legacyEvents > 0 && <Text style={s.small}>Este período contiene historial importado parcialmente.</Text>}
    </View>}
  </View>;
}

export function AnalyticsKpis({ dashboard }: { dashboard: DashboardMetrics }) {
  const [width, setWidth] = useState(0);
  const { fontScale = 1 } = useWindowDimensions();
  const basis = width >= 1120 * fontScale ? '23%' : width >= 640 * fontScale ? '47%' : '100%';
  return <View style={k.grid} onLayout={event => setWidth(event.nativeEvent.layout.width)}>{KPI_KINDS.map(kind => <View key={kind} style={{ flexBasis: basis, flexGrow: 1, minWidth: 0 }}><KpiCard kind={kind} metrics={dashboard} /></View>)}</View>;
}

export function ReportSummary({ report, exportActions = true, compact = false }: { report: AnalyticalReport; exportActions?: boolean; compact?: boolean }) {
  const [context, setContext] = useState(false);
  const { fontScale = 1 } = useWindowDimensions();
  if (!compact) {
    const saved = `${savedReportTimeLabel(report.generatedAt, report.period.timeZone)} por ${report.generatedBy.name}`;
    const rows = [
      ['Tipo', shortGroupingLabel(report.grouping)],
      ['Carreras', report.scope.career?.name ?? 'Todas, incluye sin clasificar'],
      ['Guardado', saved],
    ];
    return <View testID={`saved-report-summary-${report.id}`} style={k.reportCard}>
      <View style={[k.reportHeader, fontScale > 1.4 && { alignItems: 'flex-start' }]}>
        <View style={k.icon} accessible={false} aria-hidden><FileCheck2 size={19} color={c.PRIMARY} /></View>
        <View style={s.grow}>
          <Text style={k.reportScope}>{report.scope.institutionName} · {report.scope.campusName}</Text>
          <Text accessibilityRole="header" accessibilityLabel={`Período analizado: ${periodLabel(report.period)}`} style={k.reportPeriod}>{savedReportPeriodLabel(report.period)}</Text>
        </View>
      </View>
      <View style={k.reportBody}>
        <View style={{ gap: 7 }}>{rows.map(([label, value]) => <View key={label}
          accessible={label === 'Guardado' ? true : undefined}
          accessibilityLabel={label === 'Guardado' ? `Guardado el ${savedTimestampLabel(report.generatedAt, report.period.timeZone)}, ${report.period.timeZone}, por ${report.generatedBy.name}` : undefined}
          style={[k.reportRow, fontScale > 1.4 && k.reportRowLarge]}>
          <Text style={[k.reportLabel, fontScale > 1.4 && { width: '100%' }]}>{label}</Text><Text selectable style={[k.reportValue, label === 'Tipo' && { fontWeight: '600' }, fontScale > 1.4 && k.reportValueLarge]}>{value}</Text>
        </View>)}</View>
        <View style={k.reportNote}><Text style={k.reportNoteText}>Estas cifras son una copia fija: no cambian al actualizar el tablero.</Text></View>
        {exportActions && <ReportExportActions reportId={report.id} />}
      </View>
    </View>;
  }
  return <View style={[s.card, k.compactReport]}>
    <Text style={s.label}>{periodLabel(report.period)}</Text>
    <Text style={s.small}>Período analizado</Text>
    <Text style={s.body}>{compact ? report.scope.campusName : `${report.scope.institutionName} · ${report.scope.campusName}`}</Text>
    {compact && <Pressable accessibilityRole="button" accessibilityLabel={`Ver contexto completo del reporte de ${report.scope.campusName}, ${periodLabel(report.period)}`} accessibilityState={{ expanded: context }} onPress={() => setContext(value => !value)} style={k.explanation}>
      <Text style={[s.link, { flexShrink: 1 }]}>{context ? 'Ocultar contexto completo' : 'Ver contexto completo'}</Text>{context ? <ChevronUp size={17} color={c.PRIMARY} aria-hidden /> : <ChevronDown size={17} color={c.PRIMARY} aria-hidden />}
    </Pressable>}
    {(!compact || context) && <>
    {compact && <Text style={s.small}>Institución: {report.scope.institutionName}</Text>}
    <View style={s.wrap}><View style={s.badge}><Text style={s.badgeText}>{groupingLabel(report.grouping)}</Text></View>
      <Text style={s.small}>{report.scope.career?.name ?? copy.allCareers}</Text></View>
    <Text style={s.small}>Guardado el {savedTimestampLabel(report.generatedAt, report.period.timeZone)} · {report.period.timeZone}</Text>
    <Text style={s.small}>por {report.generatedBy.name}</Text>
    <Text style={s.muted}>{copy.savedHelp}</Text>
    </>}
    {exportActions && <ReportExportActions reportId={report.id} />}
  </View>;
}

export function AnalyticsResults({ dashboard, report, showKpis = true, onEditFilters }: { dashboard: DashboardData; report?: AnalyticalReport | null; showKpis?: boolean; onEditFilters?: () => void }) {
  return <View style={s.stack}>
    {report && <ReportSummary report={report} />}
    {showKpis && <AnalyticsKpis dashboard={dashboard} />}
    <AnalyticsTrends key={`${dashboard.generatedAt}-${dashboard.grouping}`} dashboard={dashboard} onEditFilters={onEditFilters} />
    <SubjectDemand key={`${dashboard.generatedAt}-subjects`} metric={dashboard.subjectDemand} />
  </View>;
}

const k = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { flexGrow: 1, gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14 },
  main: { minHeight: 72, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }, mainLarge: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 8 },
  expandButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  amount: { flexShrink: 0, alignItems: 'flex-start', maxWidth: '100%' },
  explanation: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  details: { gap: 8, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: c.border },
  compactReport: { padding: 12, gap: 4, borderRadius: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tint, flexShrink: 0 },
  reportCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: c.border, borderRadius: 16 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
  reportScope: { color: c.muted, fontSize: 11, lineHeight: 16 },
  reportPeriod: { color: c.PRIMARY, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  reportBody: { padding: 14, gap: 12 },
  reportRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reportRowLarge: { flexDirection: 'column', gap: 3 },
  reportLabel: { width: 64, color: c.muted, fontSize: 12, lineHeight: 19 },
  reportValue: { flex: 1, minWidth: 0, color: c.PRIMARY, fontSize: 12, lineHeight: 19 },
  reportValueLarge: { flexGrow: 0, flexBasis: 'auto', width: '100%' },
  reportNote: { backgroundColor: '#F4F7F9', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  reportNoteText: { color: c.PRIMARY, fontSize: 11, lineHeight: 17 },
  value: { color: c.PRIMARY, fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  count: { fontWeight: '600', color: c.ink },
});
