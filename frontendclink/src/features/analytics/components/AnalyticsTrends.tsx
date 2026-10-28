import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Polygon, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { DashboardData, DashboardInterval, DashboardMetrics } from '../types/dashboard';
import { compactPeriodLabel, dateLabel, formatNumber as number, periodLabel } from '../utils/presentation';
import { ANALYTICS_COPY as copy } from '../utils/copy';
import { AnalyticsButton } from './AnalyticsUI';
import { chartColors, colors as c, styles as s } from './analytics.styles';

type Indicator = 'activeUsers' | 'resourceDemand' | 'subjectDemand' | 'activityParticipation';
const indicators: { key: Indicator; label: string }[] = [
  { key: 'resourceDemand', label: copy.kpis.resourceDemand.short }, { key: 'activeUsers', label: copy.kpis.activeUsers.short },
  { key: 'subjectDemand', label: copy.kpis.subjectDemand.short }, { key: 'activityParticipation', label: copy.kpis.activityParticipation.short },
];
const series = (interval: DashboardInterval, indicator: Indicator): number[] | null => {
  const metric = interval.metrics?.[indicator];
  if (!metric || metric.value === null || interval.status === 'unavailable') return null;
  return 'views' in metric ? [metric.views, metric.requests] : [metric.value];
};

export function AnalyticsTrends({ dashboard, onEditFilters }: { dashboard: DashboardData; onEditFilters?: () => void }) {
  const gradientId = `analytics-${useId().replace(/:/g, '')}`;
  const { fontScale = 1 } = useWindowDimensions();
  const [indicator, setIndicator] = useState<Indicator>('resourceDemand');
  const [width, setWidth] = useState(280), [offset, setOffset] = useState(0), [selected, setSelected] = useState(0);
  const [table, setTable] = useState(false), [subjects, setSubjects] = useState(false);
  const intervals = dashboard.intervals ?? [];
  const singlePeriod = intervals.length === 1;
  const weekly = dashboard.grouping === 'week';
  // Seis/doce observaciones completas. El lienzo permite desplazamiento si no caben blancos de 44 px.
  const pageSize = width < 700 ? 6 : 12;
  const start = Math.min(offset, Math.max(0, intervals.length - 1));
  const visible = intervals.slice(start, start + pageSize);
  const chosen = visible[Math.min(selected, visible.length - 1)];
  const demand = indicator === 'resourceDemand' || indicator === 'subjectDemand';
  const values = visible.map(interval => series(interval, indicator));
  const max = Math.max(1, ...values.flatMap(row => row ?? []));
  // Sólo escala visual: marcas enteras legibles; nunca redondea los valores dibujados.
  const magnitude = 10 ** Math.floor(Math.log10(max / 3));
  const step = Math.max(1, ([1, 2, 5, 10].find(value => value * magnitude >= max / 3) ?? 10) * magnitude);
  const tickCount = max <= step * 2 ? 2 : 3, axisMax = step * tickCount;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => index * step);
  const axisNumber = (value: number) => value >= 10_000
    ? new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : number(value);
  const axisFont = 11 * fontScale;
  const left = Math.max(36, ...ticks.map(value => axisNumber(value).length * axisFont * 0.62 + 10)), marginRight = 8;
  const chartWidth = Math.max(width, left + marginRight + 44 * visible.length), right = chartWidth - marginRight;
  const top = 24, bottom = 174 - Math.max(0, fontScale - 1) * 14, chartHeight = 220;
  const x = (index: number) => left + (index + 0.5) * (right - left) / Math.max(visible.length, 1);
  const y = (value: number) => bottom - value / axisMax * (bottom - top);
  const slotWidth = (right - left) / Math.max(visible.length, 1);
  const labelCount = Math.min(visible.length, width < 700 ? 3 : 6);
  const labelIndices = new Set(Array.from({ length: labelCount }, (_, index) => labelCount < 2 ? 0 : Math.round(index * (visible.length - 1) / (labelCount - 1))));
  const valuesLabel = (interval: DashboardInterval) => series(interval, indicator)?.map((value, index) =>
    `${demand ? index === 0 ? 'Vistas' : 'Solicitudes' : copy.kpis[indicator].title}: ${number(value)}`).join(' · ') ?? copy.states.unavailable;
  const lineSeries = Array.from({ length: demand ? 2 : 1 }, (_, seriesIndex) => {
    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    values.forEach((row, index) => {
      if (row) run.push({ x: x(index), y: y(row[seriesIndex]) });
      else if (run.length) { runs.push(run); run = []; }
    });
    if (run.length) runs.push(run);
    return runs;
  });
  if (!intervals.length) return null;
  const changePage = (next: number) => { setOffset(next); setSelected(0); setSubjects(false); };
  return <View style={[s.card, { padding: 16 }]} onLayout={event => setWidth(Math.max(220, event.nativeEvent.layout.width - 34))}>
    <Text accessibilityRole="header" style={s.heading}>Evolución {dashboard.grouping === 'week' ? 'semanal' : 'mensual'}</Text>
    <View style={t.segmented} accessibilityRole="tablist" accessibilityLabel="Indicador de evolución">{indicators.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={`Evolución de ${item.label.toLocaleLowerCase('es')}`}
      accessibilityState={{ selected: item.key === indicator }} onPress={() => { setIndicator(item.key); setSubjects(false); }} style={[t.segment, indicator === item.key && t.segmentActive]}><Text style={s.link}>{item.label}</Text></Pressable>)}</View>
    <View style={t.segmented} accessibilityRole="tablist" accessibilityLabel="Presentación de períodos">
      {['Gráfico', 'Tabla'].map((label, index) => <Pressable key={label} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: table === Boolean(index) }} onPress={() => setTable(Boolean(index))} style={[t.segment, table === Boolean(index) && t.segmentActive]}><Text style={s.link}>{label}</Text></Pressable>)}
    </View>
    {singlePeriod && !table && <View style={t.singlePeriod}>
      <Text style={s.label}>{weekly ? 'El rango incluye una sola semana' : 'El rango incluye un solo mes'}</Text>
      <Text style={s.muted}>{weekly ? 'Para comparar semanas, elige un rango que incluya al menos dos semanas.' : 'Para comparar meses, elige un rango que incluya al menos dos meses.'}</Text>
      {onEditFilters && <AnalyticsButton secondary label="Cambiar período de analítica" onPress={onEditFilters}>Cambiar período</AnalyticsButton>}
    </View>}
    {!table && !singlePeriod ? <>
      <View style={s.wrap}>
        <Legend line={indicator !== 'activityParticipation'} label={demand ? 'Vistas' : indicator === 'activeUsers' ? 'Cuentas al cierre' : 'Inscripciones'} />
        {demand && <Legend line secondary label="Solicitudes · línea discontinua" />}
      </View>
      <Text style={s.small}>Espacio vacío = sin datos disponibles; guion = período sin datos. La marca en 0 es un cero observado.</Text>
      {indicator === 'activeUsers' && <Text style={s.small}>Saldo al cierre de cada período; no se suma entre períodos.</Text>}
      <Text style={s.small}>Toca un período del gráfico para ver sus cifras abajo.</Text>
      {chartWidth > width + 1 && <Text style={s.small}>Desliza el gráfico para ver los seis períodos; también puedes usar Tabla.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={chartWidth > width + 1} style={{ flexGrow: 0 }}>
      <View style={{ height: chartHeight, width: chartWidth }}>
      <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <Defs>{[chartColors.primary, chartColors.accent].map((color, index) => <LinearGradient key={color} id={`${gradientId}-${index}`} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={index ? 0.22 : 0.13} /><Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>)}</Defs>
        <Rect x={x(Math.min(selected, visible.length - 1)) - slotWidth / 2 + 2} y={top - 8} width={Math.max(1, slotWidth - 4)} height={bottom - top + 16} fill={chartColors.selection} rx={10} />
        {ticks.map(value => <Line key={value} x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={chartColors.grid} strokeWidth={1} />)}
        {ticks.map(value => <SvgText key={value} x={left - 8} y={y(value) + axisFont / 3} textAnchor="end" fontSize={axisFont} fill={c.muted}>{axisNumber(value)}</SvgText>)}
        {indicator !== 'activityParticipation' && lineSeries.map((runs, seriesIndex) => runs.map((run, runIndex) => {
          const points = run.map(point => `${point.x},${point.y}`).join(' '), first = run[0], last = run[run.length - 1];
          // Tramos rectos: sólo conectan observaciones consecutivas; cada área se cierra antes de un hueco.
          return <PlotLine key={`${seriesIndex}-${runIndex}`} points={points} area={run.length > 1 ? `M ${first.x},${bottom} L ${run.map(point => `${point.x},${point.y}`).join(' L ')} L ${last.x},${bottom} Z` : undefined}
            single={run.length === 1 ? first : undefined} gradient={`${gradientId}-${seriesIndex}`} secondary={seriesIndex === 1} />;
        }))}
        {values.map((row, index) => {
          const center = x(index), selectedPoint = chosen?.key === visible[index].key;
          if (!row) return <SvgText key={index} x={center} y={(top + bottom) / 2} textAnchor="middle" fontSize={axisFont} fill={c.muted}>—</SvgText>;
          return <PlotObservation key={index} bars={indicator === 'activityParticipation'} selected={selectedPoint} values={row} x={center} y={y} bottom={bottom} barWidth={Math.min(28, slotWidth * 0.46)} />;
        })}
        {visible.map((interval, index) => labelIndices.has(index) && <SvgText key={interval.key} x={x(index)} y={208} textAnchor="middle" fontSize={axisFont} fill={c.muted}>{interval.period.from.slice(5).split('-').reverse().join('/')}</SvgText>)}
      </Svg>
      </View>
      <View style={{ position: 'absolute', top: 0, height: chartHeight, left, right: marginRight, flexDirection: 'row' }}>
        {visible.map((interval, index) => <Pressable key={interval.key} accessibilityRole="button" accessibilityLabel={`Ver período ${interval.label}: ${valuesLabel(interval)}`}
          accessibilityState={{ selected: chosen?.key === interval.key }} onPress={() => { setSelected(index); setSubjects(false); }} style={{ flex: 1, minWidth: 44, minHeight: 44, borderRadius: 6 }} />)}
      </View>
      </View>
      </ScrollView>
    </> : table ? <EvolutionTable dashboard={dashboard} indicator={indicator} intervals={visible} chosen={chosen} width={width} fontScale={fontScale}
      valuesLabel={valuesLabel} onSelect={index => { setSelected(index); setSubjects(false); }} /> : null}
    {intervals.length > pageSize && <View style={{ gap: 10 }}>
      <Text style={[s.small, { textAlign: 'center' }]}>{start + 1}–{Math.min(start + pageSize, intervals.length)} de {intervals.length} períodos</Text>
      <View style={[s.spread, { flexWrap: 'wrap' }]}>
        <AnalyticsButton secondary label="Períodos anteriores" disabled={start === 0} disabledReason="Estás en los primeros períodos." onPress={() => changePage(Math.max(0, start - pageSize))} icon={<ChevronLeft size={16} color={c.PRIMARY} />}>Anterior</AnalyticsButton>
        <AnalyticsButton secondary label="Períodos siguientes" disabled={start + pageSize >= intervals.length} disabledReason="Estás en los últimos períodos." onPress={() => changePage(start + pageSize)} icon={<ChevronRight size={16} color={c.PRIMARY} />}>Siguiente</AnalyticsButton>
      </View>
    </View>}
    {chosen && <View style={table ? t.tableDetail : t.interval} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={s.label}>{table ? `${weekly ? 'Semana elegida' : 'Mes elegido'}: ${compactPeriodLabel(chosen.period)}${chosen.period.from.slice(0, 4) === chosen.period.to.slice(0, 4) ? ` ${chosen.period.to.slice(0, 4)}` : ''}` : `Período elegido · ${dateLabel(chosen.period.from)}`}</Text>
      {!table && <Text style={s.small}>{periodLabel(chosen.period)} · {chosen.period.timeZone}</Text>}
      {!chosen.metrics || !series(chosen, indicator) ? <Text style={s.muted}>{copy.states.unavailable}</Text> : <>
        <Text style={table ? s.small : s.body}>{demand && !table ? `${copy.kpis[indicator].title}: ` : ''}{valuesLabel(chosen)}</Text>
        {chosen.status === 'no_activity' && indicator !== 'activeUsers' && <Text style={s.small}>{demand ? 'No se registraron vistas ni solicitudes en este período.' : 'No se registraron inscripciones en este período.'}</Text>}
        {indicator === 'subjectDemand' && !!chosen.metrics.subjectDemand.subjects.length && <AnalyticsButton quiet onPress={() => setSubjects(value => !value)}>{subjects ? 'Ocultar asignaturas del período' : 'Ver asignaturas del período'}</AnalyticsButton>}
        {indicator === 'subjectDemand' && subjects && <SubjectDemand metric={chosen.metrics.subjectDemand} embedded />}
      </>}
    </View>}
  </View>;
}

function EvolutionTable({ dashboard, indicator, intervals, chosen, width, fontScale, valuesLabel, onSelect }: {
  dashboard: DashboardData; indicator: Indicator; intervals: DashboardInterval[]; chosen?: DashboardInterval;
  width: number; fontScale: number; valuesLabel: (interval: DashboardInterval) => string; onSelect: (index: number) => void;
}) {
  const weekly = dashboard.grouping === 'week', demand = indicator === 'resourceDemand' || indicator === 'subjectDemand';
  const columns = demand ? ['Vistas', 'Solicitudes'] : [indicator === 'activeUsers' ? 'Cuentas activas' : 'Inscripciones'];
  const metric = dashboard[indicator];
  // Los totales son la respuesta original para TODO el rango, nunca la suma de la ventana ni de saldos.
  const totals = metric.value === null ? null : 'views' in metric ? [metric.views, metric.requests] : [metric.value];
  const rows = intervals.map(interval => series(interval, indicator));
  const columnWidths = columns.map((label, index) => Math.max(72, label.length * 6 * fontScale,
    ...[...rows, totals].map(row => (row ? number(row[index]).length : 1) * 8 * fontScale)) + 12);
  const minWidth = Math.max(width - 2, 112 * fontScale + columnWidths.reduce((sum, value) => sum + value, 0) + 24);
  const month = (date: string, includeYear = true) => new Intl.DateTimeFormat('es-CL', { month: 'long', ...(includeYear ? { year: 'numeric' as const } : {}), timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(' de ', ' ');
  const first = intervals[0].period.from, last = intervals[intervals.length - 1].period.to;
  const heading = weekly ? month(first) === month(last) ? month(first) : `${month(first)} – ${month(last)}`
    : first.slice(0, 4) === last.slice(0, 4) ? first.slice(0, 4) : `${first.slice(0, 4)}–${last.slice(0, 4)}`;
  const cells = (row: number[] | null, total = false) => columns.map((label, index) => <Text key={label}
    style={[t.numericCell, { width: columnWidths[index] }, row?.[index] === 0 && !total ? t.zero : t.nonzero]}>{row ? number(row[index]) : '—'}</Text>);
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={s.heading}>{heading.charAt(0).toUpperCase() + heading.slice(1)}</Text>
    <View style={t.tableFrame}>
      <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Tabla de evolución; desplaza horizontalmente si es necesario">
        <View style={{ minWidth }}>
          <View style={t.tableHeader}>
            <Text style={[t.columnHeading, t.dateCell]}>{weekly ? 'Semana' : 'Mes'}</Text>
            {columns.map((label, index) => <Text key={label} style={[t.columnHeading, { width: columnWidths[index], textAlign: 'right' }]}>{label}</Text>)}
          </View>
          {intervals.map((interval, index) => <Pressable key={interval.key} accessibilityRole="button"
            accessibilityLabel={`Ver período ${interval.label}: ${valuesLabel(interval)}`} accessibilityHint="Muestra el detalle debajo de la tabla."
            accessibilityState={{ selected: chosen?.key === interval.key }} onPress={() => onSelect(index)}
            style={[t.tableRow, chosen?.key === interval.key && t.tableSelected]}>
            <View style={t.dateCell}>
              <Text style={[t.rowLabel, chosen?.key === interval.key && t.nonzero]}>{weekly ? compactPeriodLabel(interval.period) : month(interval.period.from, false)}</Text>
              {!weekly && <Text style={s.small}>{compactPeriodLabel(interval.period)}</Text>}
              {!rows[index] && <Text style={s.small}>Sin datos</Text>}
            </View>
            {cells(rows[index])}
          </Pressable>)}
          <View style={[t.tableRow, t.tableTotal]}>
            <Text style={[t.dateCell, t.rowLabel, t.nonzero]}>{indicator === 'activeUsers' ? 'Al cierre del rango' : 'Total del rango'}</Text>{cells(totals, true)}
          </View>
        </View>
      </ScrollView>
    </View>
    <Text style={s.small}>{indicator === 'activeUsers' ? 'Saldo al cierre del rango completo; las cuentas de distintos períodos no se suman.' : `Total del rango completo${dashboard.intervals.length > intervals.length ? ', incluidas las demás páginas' : ''}.`} {periodLabel(dashboard.period)}.</Text>
    {totals === null && <Text style={s.small}>No hay datos disponibles para el total del rango.</Text>}
  </View>;
}

function PlotLine({ points, area, single, gradient, secondary }: { points: string; area?: string; single?: { x: number; y: number }; gradient: string; secondary: boolean }) {
  const actualPoints = single ? `${single.x - 5},${single.y} ${single.x + 5},${single.y}` : points;
  return <>
    {area && <Path d={area} fill={`url(#${gradient})`} />}
    {secondary && <Polyline points={actualPoints} fill="none" stroke={chartColors.accentEdge} strokeWidth={4.5} strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />}
    <Polyline points={actualPoints} fill="none" stroke={secondary ? chartColors.accent : chartColors.primary} strokeWidth={2.5} strokeDasharray={secondary ? '7 5' : undefined} strokeLinecap="round" strokeLinejoin="round" />
  </>;
}

function PlotObservation({ bars, selected, values, x, y, bottom, barWidth }: { bars: boolean; selected: boolean; values: number[]; x: number; y: (value: number) => number; bottom: number; barWidth: number }) {
  return <>{values.map((value, index) => {
    const top = y(value), left = x - barWidth / 2, right = x + barWidth / 2, radius = Math.min(5, barWidth / 2, (bottom - top) / 2);
    return <PlotMark key={index} bars={bars} selected={selected} value={value} secondary={index > 0} x={x} y={top} bottom={bottom} left={left} right={right} radius={radius} />;
  })}</>;
}

function PlotMark({ bars, selected, value, secondary, x, y, bottom, left, right, radius }: { bars: boolean; selected: boolean; value: number; secondary: boolean; x: number; y: number; bottom: number; left: number; right: number; radius: number }) {
  return <>
    {bars && value > 0 && <Path d={`M ${left},${bottom} L ${left},${y + radius} Q ${left},${y} ${left + radius},${y} L ${right - radius},${y} Q ${right},${y} ${right},${y + radius} L ${right},${bottom} Z`} fill={selected ? chartColors.primary : c.SECONDARY} />}
    {value === 0 && <Line x1={bars ? left : x - 5} x2={bars ? right : x + 5} y1={bottom} y2={bottom} stroke={secondary ? chartColors.accentEdge : chartColors.primary} strokeWidth={2.5} />}
    {selected && <>
      <Circle cx={x} cy={y} r={11} fill={secondary ? chartColors.accent : chartColors.primary} fillOpacity={0.12} />
      {secondary ? <Polygon points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} fill={chartColors.accent} stroke={chartColors.accentEdge} strokeWidth={1.5} />
        : <Circle cx={x} cy={y} r={4.5} fill={chartColors.primary} stroke="#FFFFFF" strokeWidth={2} />}
    </>}
  </>;
}

function Legend({ label, secondary = false, line = false }: { label: string; secondary?: boolean; line?: boolean }) {
  if (line) return <View style={[s.row, { maxWidth: '100%', flexShrink: 1 }]}>
    <View accessible={false} aria-hidden style={{ flexShrink: 0 }}><Svg width={30} height={18}>
      {secondary && <Line x1={2} x2={28} y1={9} y2={9} stroke={chartColors.accentEdge} strokeWidth={4.5} strokeDasharray="6 4" />}
      <Line x1={2} x2={28} y1={9} y2={9} stroke={secondary ? chartColors.accent : chartColors.primary} strokeWidth={2.5} strokeDasharray={secondary ? '6 4' : undefined} />
      {secondary ? <Polygon points="15,4 20,9 15,14 10,9" fill={chartColors.accent} stroke={chartColors.accentEdge} strokeWidth={1.5} /> : <Circle cx={15} cy={9} r={3} fill={chartColors.primary} />}
    </Svg></View><Text style={[s.small, { flexShrink: 1 }]}>{label}</Text>
  </View>;
  return <View style={[s.row, { maxWidth: '100%', flexShrink: 1 }]}><View style={{ width: secondary ? 16 : 9, height: 9, flexShrink: 0, borderRadius: secondary ? 1 : 5, backgroundColor: secondary ? '#A9C2D6' : c.PRIMARY, borderWidth: 1, borderColor: c.SECONDARY }} /><Text style={[s.small, { flexShrink: 1 }]}>{label}</Text></View>;
}

export function SubjectDemand({ metric, embedded = false }: { metric: DashboardMetrics['subjectDemand']; embedded?: boolean }) {
  const [all, setAll] = useState(false), [search, setSearch] = useState(''), [limit, setLimit] = useState(20);
  const rows = [...metric.subjects].sort((a, b) => (b.views + b.requests) - (a.views + a.requests) || a.subjectName.localeCompare(b.subjectName, 'es'));
  const matches = rows.filter(row => row.subjectName.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const visible = all ? matches.slice(0, limit) : rows.slice(0, 5);
  const max = Math.max(1, ...rows.map(row => row.views + row.requests));
  return <View style={embedded ? s.stack : s.card}>
    {!embedded && <View><Text accessibilityRole="header" style={s.heading}>Interés por asignatura</Text><Text style={[s.muted, { marginTop: 5 }]}>Primero las más vistas y solicitadas.</Text></View>}
    {metric.value === null ? <Text style={s.muted}>{copy.states.unavailable}</Text> : !rows.length ? <Text style={s.muted}>{copy.states.zero}</Text> : <>
      <View style={s.wrap}><Legend label="Vistas" /><Legend secondary label="Solicitudes" /></View>
      {all && <TextInput accessibilityLabel="Buscar asignatura en los resultados" style={s.input} value={search} placeholder="Buscar asignatura" onChangeText={value => { setSearch(value); setLimit(20); }} />}
      {visible.map(row => <View key={row.subjectId} style={{ gap: 7 }}>
        <Text style={s.label}>{row.subjectName}</Text>
        <View accessible={false} aria-hidden style={t.track}><View style={{ height: 7, width: `${row.views / max * 100}%`, backgroundColor: c.PRIMARY }} /><View style={{ height: 7, width: `${row.requests / max * 100}%`, backgroundColor: '#A9C2D6' }} /></View>
        <Text style={s.small}>{number(row.views)} vistas · {number(row.requests)} solicitudes</Text>
      </View>)}
      {all && !visible.length && <Text style={s.muted}>No hay asignaturas que coincidan.</Text>}
      {rows.length > 5 && <AnalyticsButton quiet onPress={() => { setAll(value => !value); setSearch(''); setLimit(20); }}>{all ? 'Ver solo las primeras cinco' : `Ver todas las asignaturas (${number(rows.length)})`}</AnalyticsButton>}
      {all && matches.length > limit && <AnalyticsButton secondary onPress={() => setLimit(value => value + 20)}>Mostrar más asignaturas</AnalyticsButton>}
    </>}
    <Text style={s.small}>Un recurso vinculado a varias asignaturas cuenta en cada una. Estos valores no representan interacciones exclusivas.</Text>
  </View>;
}

const t = StyleSheet.create({
  tableFrame: { borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  columnHeading: { color: c.SECONDARY, fontSize: 11, textTransform: 'uppercase', flexShrink: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, minHeight: 48, borderTopWidth: 1, borderColor: c.border },
  tableSelected: { backgroundColor: '#E5EFF5' },
  tableTotal: { borderTopWidth: 2, backgroundColor: '#F8FBFD' },
  dateCell: { flex: 1, paddingRight: 8, gap: 4 },
  rowLabel: { color: c.PRIMARY, fontSize: 13 },
  numericCell: { textAlign: 'right', fontSize: 14, flexShrink: 0, fontVariant: ['tabular-nums'] },
  zero: { color: c.muted, fontWeight: '400' },
  nonzero: { color: c.PRIMARY, fontWeight: '700' },
  tableDetail: { gap: 7, paddingHorizontal: 2 },
  singlePeriod: { backgroundColor: c.tint, borderRadius: 12, padding: 16, gap: 10 },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, backgroundColor: c.tint, padding: 4, borderRadius: 14 },
  segment: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 10, flexGrow: 1 },
  segmentActive: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: c.border },
  interval: { backgroundColor: '#F4F7FA', borderRadius: 12, padding: 14, gap: 7 }, track: { height: 7, flexDirection: 'row', borderRadius: 6, backgroundColor: '#EFF3F6', overflow: 'hidden' },
});
