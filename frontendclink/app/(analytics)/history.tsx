import { useEffect, useRef, useState } from 'react';
import { Files, SlidersHorizontal, X } from 'lucide-react-native';
import { Pressable, Text, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { Pagination } from '@/components/Pagination';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { AnalyticsResults, ReportSummary } from '@/features/analytics/components/AnalyticsResults';
import { SavedReportCard } from '@/features/analytics/components/SavedReportCard';
import { ReportExportActions } from '@/features/analytics/components/ReportExportActions';
import { AnalyticsFilters } from '@/features/analytics/components/AnalyticsFilters';
import { AppliedFiltersSummary } from '@/features/analytics/components/AppliedFiltersSummary';
import { AnalyticsButton, AnalyticsMessage, AnalyticsModal, AnalyticsPage, AnalyticsSkeleton, type AnalyticsFocusTarget } from '@/features/analytics/components/AnalyticsUI';
import { ReportComparison } from '@/features/analytics/components/ReportComparison';
import { colors as c, styles as s } from '@/features/analytics/components/analytics.styles';
import { useHistoricalReports } from '@/features/analytics/hooks/useHistoricalReports';
import { compactPeriodLabel, dateLabel, periodLabel } from '@/features/analytics/utils/presentation';
import { ANALYTICS_COPY as copy } from '@/features/analytics/utils/copy';

export default function HistoricalReportsScreen() {
  const history = useHistoricalReports();
  const { fontScale = 1 } = useWindowDimensions();
  const [filterIdentity, setFilterIdentity] = useState<string | null>(null);
  const [detailIdentity, setDetailIdentity] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const opener = useRef<AnalyticsFocusTarget>(null);
  const reportButtons = useRef(new Map<string, AnalyticsFocusTarget | null>());
  const selectionButton = useRef<AnalyticsFocusTarget>(null);
  const scroll = useRef<ScrollViewInstance>(null);
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
  const career = history.options?.institutions.flatMap(row => row.careers).find(row => row.id === history.filters.careerId)?.name;
  const campuses = history.options?.institutions.flatMap(row => row.campuses) ?? [];
  const campusLabel = history.filters.campusIds?.length
    ? history.filters.campusIds.map(id => campuses.find(row => row.id === id)?.name ?? 'Campus seleccionado (fuera del catálogo actual)').join(', ')
    : 'Todos los campus autorizados';
  const careerLabel = history.filters.careerId ? career ?? 'Carrera seleccionada (fuera del catálogo actual)' : copy.allCareers;
  const { from, to, grouping } = history.filters;
  const period = from && to ? { from, to } : null;
  const periodDetail = period ? periodLabel(period) : from ? `Desde el ${dateLabel(from)}` : to ? `Hasta el ${dateLabel(to)}` : 'Todos los períodos';
  const contextRows = [
    ...(history.filters.institutionId ? [['Institución', institution?.name ?? 'Institución seleccionada']] : []),
    [history.filters.campusIds && history.filters.campusIds.length > 1 ? 'Sedes' : 'Sede', campusLabel],
    ['Carreras', careerLabel], ['Período', periodDetail],
    ['Agrupación', grouping === 'week' ? 'Por semana' : grouping === 'month' ? 'Por mes' : 'Semana y mes'],
  ];
  const filterSummary = [institution?.name, campusLabel, period ? compactPeriodLabel(period) : periodDetail].filter(Boolean).join(' · ');
  const selection = history.allowed && history.selectedIds.length > 0 && <View accessibilityLabel="Selección para comparar" style={{ gap: 4 }}>
    <View style={[s.spread, { flexWrap: 'wrap' }]}>
      <View style={[s.row, { flex: 1, minWidth: 120 }]}><Files size={19} color={c.PRIMARY} aria-hidden /><View style={s.grow}>
        <Text accessibilityLiveRegion="polite" style={s.label}>Comparando: A{first ? ` = ${periodLabel(first.period)} · ${first.scope.campusName}` : ' elegido'}. Falta elegir B</Text>
        <Text style={s.small}>Pulsa Comparar en otro reporte, incluso en otra página.</Text>
      </View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Quitar selección" onPress={close} style={s.iconButton}><X size={20} color={c.PRIMARY} aria-hidden /></Pressable>
    </View>
    {!!first && <AnalyticsButton quiet buttonRef={selectionButton} onPress={() => { opener.current = selectionButton.current; setDetailIdentity(history.identityKey); }}>{`Ver A · ${periodLabel(first.period)}`}</AnalyticsButton>}
    {!!history.detailError && detailIdentity === null && <Text accessibilityRole="alert" style={s.error}>{history.detailError} Vuelve a abrir el reporte o quita la selección.</Text>}
  </View>;
  return <AnalyticsPage history footer={selection} scrollRef={scroll} refresh={{ onRefresh: history.refresh, refreshing: history.loading,
    enabled: history.allowed && !history.loading && filterIdentity !== history.identityKey && detailIdentity !== history.identityKey,
    label: 'los reportes guardados' }}>
    <View style={[s.spread, fontScale > 1.4 && { flexDirection: 'column', alignItems: 'stretch' }]}><View style={s.grow}><Text accessibilityRole="header" style={s.heading}>Tus reportes</Text>
      <Text style={s.muted}>Abre un reporte o elige dos para comparar.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir filtros de reportes" accessibilityState={{ disabled: !history.allowed }}
        accessibilityHint={!history.allowed ? 'Necesitas acceso a reportería.' : `${filterCount} filtros aplicados. Cambiar campus, carrera, fechas y agrupación.`}
        disabled={!history.allowed} onPress={() => setFilterIdentity(history.identityKey)}
        style={[s.filtersButton, { alignSelf: 'flex-end' }, !history.allowed && s.disabled]}>
        <SlidersHorizontal size={17} color={c.PRIMARY} aria-hidden />
        <View style={s.filterCount} accessible={false} aria-hidden><Text style={s.filterCountText}>{filterCount}</Text></View>
      </Pressable>
    </View>
    <View style={{ gap: 10 }}>
      <AppliedFiltersSummary identityKey={history.identityKey} rows={contextRows} summary={filterSummary}
        hint={`${contextRows.map(([label, value]) => `${label}: ${value}`).join('. ')}. Muestra los filtros de búsqueda aplicados al listado.`} />
      {!!feedback && <Text accessibilityLiveRegion="polite" style={s.small}>{feedback}</Text>}
      {filtered && <AnalyticsButton quiet onPress={() => { history.search({}); setFeedback('Se muestran todos los reportes autorizados.'); }}>Limpiar filtros</AnalyticsButton>}
    </View>
    {!history.allowed ? <AnalyticsMessage title="Acceso a reportes">{copy.states.permission}</AnalyticsMessage> : <>
      {history.loading && <SavedReportsSkeleton />}
      {!!history.error && <AnalyticsMessage error title="No pudimos cargar el historial" onRetry={history.refresh}>{`${copy.states.error} ${history.error}`}</AnalyticsMessage>}
      {history.page?.items.length === 0 && <AnalyticsMessage title={filtered ? 'Sin coincidencias' : 'Aún no hay reportes guardados'}>
        {filtered ? 'Prueba otras fechas o campus, o limpia los filtros.' : 'Guarda tu primer reporte desde Resumen para encontrarlo aquí.'}
      </AnalyticsMessage>}
      {!!history.page?.items.length && <Text style={s.small}>{history.hasPrevious ? `Mostrando otros ${history.page.items.length} reportes, del más reciente al más antiguo` : `Mostrando los ${history.page.items.length} más recientes`}</Text>}
      {history.page?.items.map((report, index) => <SavedReportCard key={report.id} report={report} position={index + 1}
        selected={history.selectedIds[0] === report.id} onOpen={() => open(report.id)} onCompare={() => selectForComparison(report.id)}
        register={(key, target) => { reportButtons.current.set(key, target); }} />)}
      <Pagination page={history.pageNumber} visitedPages={history.visitedPages} hasNextPage={!!history.page?.nextCursor}
        disabled={history.loading} onPageChange={page => { history.goToPage(page); scroll.current?.scrollTo({ y: 0, animated: false }); }} label="Paginación de reportes guardados" />
      {detailIdentity === history.identityKey && history.selectedIds.length > 0 && <AnalyticsModal title={history.selectedIds.length > 1 ? 'Comparar reportes' : copy.savedReport}
        showCloseButton={history.selectedIds.length > 1} onClose={close} returnFocusRef={opener}>
        {history.detailLoading && <AnalyticsSkeleton label="Abriendo reportes" />}
        {!!history.detailError && <AnalyticsMessage error title="No pudimos abrir el reporte" onRetry={history.retryDetail}>{`${history.detailError} Vuelve a consultar; las cifras de la comparación se retiraron.`}</AnalyticsMessage>}
        {history.reports.length === 1 && <>
          <ReportSummary report={history.reports[0]} exportActions={false} />
          <AnalyticsResults key={history.reports[0].id} dashboard={history.reports[0]} />
          <ReportExportActions reportId={history.reports[0].id} />
        </>}
        {history.selectedIds.length === 1 && <AnalyticsButton onPress={close}>Volver a reportes guardados</AnalyticsButton>}
        {history.reports.length === 2 && <ReportComparison key={history.selectedIds.join(',')} reports={history.reports} />}
      </AnalyticsModal>}
      {filterIdentity === history.identityKey && <AnalyticsFilters historical key={`filters-${history.identityKey}`} options={history.options} value={history.filters}
        onClose={() => setFilterIdentity(null)} onApply={(value, applied) => { history.search(value); setFilterIdentity(null); setFeedback(applied.careerCleared ? copy.careerCleared : ''); }} />}
    </>}
  </AnalyticsPage>;
}

function SavedReportsSkeleton() {
  return <Skeleton label="Cargando historial" contentStyle={{ gap: 12 }}>
    {[0, 1, 2].map(key => <View key={key} style={{ backgroundColor: '#FFFFFF', borderWidth: 1,
      borderColor: c.border, borderRadius: 15, padding: 12, gap: 10 }}>
      <View style={s.spread}><SkeletonBlock width={60} height={18} borderRadius={9} /><SkeletonBlock width={94} height={12} /></View>
      <SkeletonBlock width="78%" height={20} /><SkeletonBlock width="60%" height={12} /><SkeletonBlock width="70%" height={12} />
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 10 }}>
        <View style={s.row}><SkeletonBlock width={28} height={28} borderRadius={14} />
          <View style={{ flex: 1, gap: 5 }}><SkeletonBlock width="40%" height={12} /><SkeletonBlock width="65%" height={12} /></View></View>
        <View style={[s.row, { justifyContent: 'flex-end' }]}><SkeletonBlock width={64} height={44} borderRadius={8} /><SkeletonBlock width={90} height={44} borderRadius={8} /></View>
      </View>
    </View>)}
  </Skeleton>;
}
