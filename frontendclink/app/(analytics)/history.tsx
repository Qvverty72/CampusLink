import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Files, SlidersHorizontal, UserRound, X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { AnalyticsResults } from '@/features/analytics/components/AnalyticsResults';
import { AnalyticsFilters } from '@/features/analytics/components/AnalyticsFilters';
import { AnalyticsButton, AnalyticsMessage, AnalyticsModal, AnalyticsPage, AnalyticsSkeleton, type AnalyticsFocusTarget } from '@/features/analytics/components/AnalyticsUI';
import { ReportComparison } from '@/features/analytics/components/ReportComparison';
import { colors as c, styles as s } from '@/features/analytics/components/analytics.styles';
import { useHistoricalReports } from '@/features/analytics/hooks/useHistoricalReports';
import { groupingLabel, periodLabel, timestampLabel } from '@/features/analytics/utils/presentation';
import { ANALYTICS_COPY as copy } from '@/features/analytics/utils/copy';

export default function HistoricalReportsScreen() {
  const history = useHistoricalReports();
  const [filterIdentity, setFilterIdentity] = useState<string | null>(null);
  const [detailIdentity, setDetailIdentity] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const opener = useRef<AnalyticsFocusTarget>(null);
  const reportButtons = useRef(new Map<string, AnalyticsFocusTarget | null>());
  const selectionButton = useRef<AnalyticsFocusTarget>(null);
  useEffect(() => { setFilterIdentity(null); setDetailIdentity(null); setFeedback(''); }, [history.identityKey]);
  const open = (id: string, compare = false) => {
    opener.current = reportButtons.current.get(compare ? `${id}:compare` : id) ?? selectionButton.current;
    history.open(id, compare); setDetailIdentity(history.identityKey);
  };
  const selectForComparison = (id: string) => {
    if (history.selectedIds.length && history.selectedIds[0] !== id) open(id, true);
    else { history.open(id); setDetailIdentity(null); }
  };
  const close = () => { setDetailIdentity(null); history.close(); };
  const filtered = Object.values(history.filters).some(value => Array.isArray(value) ? value.length > 0 : !!value);
  const filterCount = [history.filters.campusIds?.length, history.filters.careerId, history.filters.from || history.filters.to, history.filters.grouping].filter(Boolean).length;
  const first = history.reports[0];
  const institution = history.options?.institutions.find(row => row.id === history.filters.institutionId);
  const names = institution?.campuses.filter(row => history.filters.campusIds?.includes(row.id)).map(row => row.name).join(', ');
  const career = institution?.careers.find(row => row.id === history.filters.careerId)?.name;
  const selection = history.allowed && history.selectedIds.length > 0 && <View accessibilityLabel="Selección para comparar" style={{ gap: 4 }}>
    <View style={[s.spread, { flexWrap: 'wrap' }]}>
      <View style={[s.row, { flex: 1, minWidth: 120 }]}><Files size={19} color={c.PRIMARY} aria-hidden /><View style={s.grow}>
        <Text accessibilityLiveRegion="polite" style={s.label}>A elegido · Elegir B</Text>
        <Text style={s.small}>Pulsa Comparar en otro reporte, incluso en otra página.</Text>
      </View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Quitar selección" onPress={close} style={s.iconButton}><X size={20} color={c.PRIMARY} aria-hidden /></Pressable>
    </View>
    {!!first && <AnalyticsButton quiet buttonRef={selectionButton} onPress={() => { opener.current = selectionButton.current; setDetailIdentity(history.identityKey); }}>{`Ver A · ${periodLabel(first.period)}`}</AnalyticsButton>}
    {!!history.detailError && detailIdentity === null && <Text accessibilityRole="alert" style={s.error}>{history.detailError} Vuelve a abrir el reporte o quita la selección.</Text>}
  </View>;
  return <AnalyticsPage history footer={selection}>
    <View style={s.spread}><View style={s.grow}><Text accessibilityRole="header" style={s.heading}>Tus reportes</Text>
      <Text style={s.muted}>Abre un reporte o elige dos para comparar.</Text></View>
      <View style={{ maxWidth: '45%' }}><AnalyticsButton secondary label="Abrir filtros de reportes" disabled={!history.allowed} disabledReason="Necesitas acceso a reportería."
        onPress={() => setFilterIdentity(history.identityKey)} icon={<SlidersHorizontal size={17} color={c.PRIMARY} />}>{filterCount ? `Filtros (${filterCount})` : 'Filtros'}</AnalyticsButton></View>
    </View>
    <Text style={s.small}>{filtered ? [names || (history.filters.campusIds?.length ? 'Campus seleccionados' : 'Todos los campus autorizados'), career ?? copy.allCareers,
      history.filters.from || history.filters.to ? `${history.filters.from ?? 'Desde el inicio'} → ${history.filters.to ?? 'Hasta hoy'}` : 'Todos los períodos', history.filters.grouping ? groupingLabel(history.filters.grouping) : 'Semanas y meses'].join(' · ')
      : 'Todos tus campus autorizados · Todos los períodos'}</Text>
    {!!feedback && <Text accessibilityLiveRegion="polite" style={s.body}>{feedback}</Text>}
    {filtered && <AnalyticsButton quiet onPress={() => { history.search({}); setFeedback('Filtros quitados.'); }}>Limpiar filtros</AnalyticsButton>}
    {!history.allowed ? <AnalyticsMessage title="Acceso a reportes">{copy.states.permission}</AnalyticsMessage> : <>
      {history.loading && <AnalyticsSkeleton label="Cargando historial" />}
      {!!history.error && <AnalyticsMessage error title="No pudimos cargar el historial" onRetry={() => history.search()}>{`${copy.states.error} ${history.error}`}</AnalyticsMessage>}
      {history.page?.items.length === 0 && <AnalyticsMessage title={filtered ? 'Sin coincidencias' : 'Aún no hay reportes guardados'}>
        {filtered ? 'Prueba otras fechas o campus, o limpia los filtros.' : 'Guarda tu primer reporte desde Resumen para encontrarlo aquí.'}
      </AnalyticsMessage>}
      {history.page?.items.map(report => <View key={report.id} style={s.card}>
        <View style={s.spread}><View style={s.badge}><Text style={s.badgeText}>{groupingLabel(report.grouping)}</Text></View>
          {history.selectedIds[0] === report.id && <View style={s.row}><Check size={17} color={c.PRIMARY} aria-hidden /><Text style={s.small}>A elegido</Text></View>}</View>
        <Text accessibilityRole="header" style={s.heading}>{periodLabel(report.period)}</Text>
        <View style={{ gap: 5 }}><Text style={s.body}>{report.scope.institutionName} · {report.scope.campuses.map(campus => campus.name).join(', ')}</Text>
          <Text style={s.small}>{report.scope.career?.name ?? copy.allCareers}</Text>
          <Text style={s.small}>Generado el {timestampLabel(report.generatedAt, report.period.timeZone)} · {report.period.timeZone}</Text>
          <View style={s.row}><UserRound size={14} color={c.muted} aria-hidden /><Text style={[s.small, s.grow]}>{report.generatedBy.name}</Text></View>
        </View>
        <View style={s.wrap}><AnalyticsButton secondary buttonRef={target => { reportButtons.current.set(report.id, target); }} label={`Abrir reporte ${report.id}`} onPress={() => open(report.id)} icon={<ChevronRight size={16} color={c.PRIMARY} />}>Abrir reporte</AnalyticsButton>
          <AnalyticsButton buttonRef={target => { reportButtons.current.set(`${report.id}:compare`, target); }} label={`Comparar con reporte ${report.id}`} onPress={() => selectForComparison(report.id)}>{history.selectedIds[0] === report.id ? 'A elegido' : 'Comparar'}</AnalyticsButton>
        </View>
      </View>)}
      <View style={s.wrap}>
        {!!history.page?.nextCursor && <AnalyticsButton disabled={history.loading} disabledReason="Espera a que termine la carga." onPress={history.nextPage}>Siguiente página</AnalyticsButton>}
        {history.hasPrevious && <AnalyticsButton secondary disabled={history.loading} disabledReason="Espera a que termine la carga." onPress={history.firstPage}>Volver a la primera página</AnalyticsButton>}
      </View>
      {detailIdentity === history.identityKey && history.selectedIds.length > 0 && <AnalyticsModal title={history.selectedIds.length > 1 ? 'Comparar reportes' : copy.savedReport} onClose={close} returnFocusRef={opener}>
        {history.detailLoading && <AnalyticsSkeleton label="Abriendo reportes" />}
        {!!history.detailError && <AnalyticsMessage error title="No pudimos abrir el reporte" onRetry={history.retryDetail}>{`${history.detailError} Vuelve a consultar; las cifras de la comparación se retiraron.`}</AnalyticsMessage>}
        {history.reports.length === 1 && <>
          <AnalyticsButton secondary onPress={() => setDetailIdentity(null)} icon={<Files size={17} color={c.PRIMARY} />}>Elegir otro reporte para comparar</AnalyticsButton>
          <AnalyticsResults key={history.reports[0].id} dashboard={history.reports[0]} report={history.reports[0]} />
        </>}
        {history.reports.length === 2 && <ReportComparison key={history.selectedIds.join(',')} reports={history.reports} />}
      </AnalyticsModal>}
      {filterIdentity === history.identityKey && <AnalyticsFilters historical key={`filters-${history.identityKey}`} options={history.options} value={history.filters}
        onClose={() => setFilterIdentity(null)} onApply={(value, applied) => { history.search(value); setFilterIdentity(null); setFeedback(applied.careerCleared ? `${copy.applied} ${copy.careerCleared}` : copy.applied); }} />}
    </>}
  </AnalyticsPage>;
}
