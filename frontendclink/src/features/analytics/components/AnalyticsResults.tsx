import { useState } from 'react';
import { ChevronDown, ChevronUp, FileCheck2 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { AnalyticalReport, DashboardData, DashboardMetrics } from '../types/dashboard';
import { formatNumber as number, groupingLabel, periodLabel, timestampLabel } from '../utils/presentation';
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
  const [details, setDetails] = useState(false);
  const [context, setContext] = useState(false);
  return <View style={[s.card, compact && k.compactReport]}>
    {!compact && <View style={s.row}><View style={k.icon}><FileCheck2 size={22} color={c.PRIMARY} aria-hidden /></View>
      <Text accessibilityRole="header" style={[s.heading, s.grow]}>{copy.savedReport}</Text></View>}
    <Text style={s.body}>{compact ? report.scope.campusName : `${report.scope.institutionName} · ${report.scope.campusName}`}</Text>
    <Text style={s.label}>{periodLabel(report.period)}</Text>
    {compact && <Pressable accessibilityRole="button" accessibilityLabel={`Ver contexto completo del reporte de ${report.scope.campusName}, ${periodLabel(report.period)}`} accessibilityState={{ expanded: context }} onPress={() => setContext(value => !value)} style={k.explanation}>
      <Text style={[s.link, { flexShrink: 1 }]}>{context ? 'Ocultar contexto completo' : 'Ver contexto completo'}</Text>{context ? <ChevronUp size={17} color={c.PRIMARY} aria-hidden /> : <ChevronDown size={17} color={c.PRIMARY} aria-hidden />}
    </Pressable>}
    {(!compact || context) && <>
    {compact && <Text style={s.small}>Institución: {report.scope.institutionName}</Text>}
    <View style={s.wrap}><View style={s.badge}><Text style={s.badgeText}>{groupingLabel(report.grouping)}</Text></View>
      <Text style={s.small}>{report.scope.career?.name ?? copy.allCareers}</Text></View>
    <Text style={s.small}>Generado el {timestampLabel(report.generatedAt, report.period.timeZone)} · {report.period.timeZone}</Text>
    <Text style={s.small}>Responsable: {report.generatedBy.name}</Text>
    <Text style={s.muted}>{copy.savedHelp}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} style={s.back}>
      <Text style={s.link}>Detalles del reporte</Text>{details ? <ChevronUp size={17} color={c.PRIMARY} aria-hidden /> : <ChevronDown size={17} color={c.PRIMARY} aria-hidden />}
    </Pressable>
    {details && <View style={s.stack}>
      <Text style={s.muted}>{copy.reportDetailsHelp}</Text>
      <Text selectable style={s.small}>Identificador: {report.id}</Text>
      <Text selectable style={s.small}>Institución: {report.scope.institutionName} · {report.scope.institutionId}</Text>
      {(report.scope.campuses ?? []).map(campus => <Text selectable key={campus.id} style={s.small}>Campus: {campus.name} · {campus.id}</Text>)}
      <Text selectable style={s.small}>Carrera: {report.scope.career ? `${report.scope.career.name} · ${report.scope.career.id}` : copy.allCareers}</Text>
      <Text selectable style={s.small}>Período: {report.period.from} al {report.period.to} · {report.period.timeZone}</Text>
      <Text selectable style={s.small}>Corte exclusivo: {report.period.cutoff}</Text>
      <Text selectable style={s.small}>Fecha original: {report.generatedAt}</Text>
      <Text selectable style={s.small}>Responsable: {report.generatedBy.userId}</Text>
      <Text selectable style={s.small}>Versión de cálculo: {report.calculationVersion}</Text>
    </View>}
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
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tint, flexShrink: 0 },
  value: { color: c.PRIMARY, fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6 },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  count: { fontWeight: '600', color: c.ink },
});
