import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ArrowLeft, FilePlus2, SlidersHorizontal } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAnalyticsDashboard } from '@/features/analytics/hooks/useAnalyticsDashboard';
import { AnalyticsResults } from '@/features/analytics/components/AnalyticsResults';
import { AnalyticsFilters } from '@/features/analytics/components/AnalyticsFilters';
import { AppliedFiltersSummary } from '@/features/analytics/components/AppliedFiltersSummary';
import { AnalyticsButton, AnalyticsMessage, AnalyticsPage, AnalyticsSkeleton } from '@/features/analytics/components/AnalyticsUI';
import { colors as c, styles as s } from '@/features/analytics/components/analytics.styles';
import { compactPeriodLabel, monthRange, periodLabel } from '@/features/analytics/utils/presentation';
import { ANALYTICS_COPY as copy } from '@/features/analytics/utils/copy';

/** Consulta actual y generación explícita comparten ámbito, pero conservan resultados separados. */
export default function AnalyticsScreen() {
  const [initial] = useState(() => monthRange());
  const state = useAnalyticsDashboard(initial);
  const [filterIdentity, setFilterIdentity] = useState<string | null>(null);
  useEffect(() => { setFilterIdentity(null); }, [state.identityKey]);
  const dashboard = state.report ?? state.dashboard;
  const institution = state.options?.institutions.find(row => row.id === state.filters?.institutionId);
  const scope = dashboard?.scope;
  const names = institution?.campuses.filter(row => state.filters?.campusIds.includes(row.id)).map(row => row.name).join(', ');
  const career = institution?.careers.find(row => row.id === state.filters?.careerId)?.name;
  const institutionLabel = scope?.institutionName ?? institution?.name ?? 'Tu institución';
  const campusLabel = scope?.campusName || names || 'Campus autorizados';
  const contextPeriod = dashboard?.period ?? state.range;
  const grouping = dashboard?.grouping ?? state.range.grouping;
  const contextRows = [
    [(scope?.campuses?.length ?? state.filters?.campusIds.length ?? 0) > 1 ? 'Sedes' : 'Sede', campusLabel],
    ['Carreras', scope ? scope.career?.name ?? copy.allCareers : career ?? copy.allCareers],
    ['Período', periodLabel(contextPeriod)],
    ['Agrupación', grouping === 'week' ? 'Por semana' : 'Por mes'],
  ];
  const activeFilters = (state.filters?.campusIds.length ? 1 : 0) + (state.filters?.careerId ? 1 : 0)
    + (state.range.from && state.range.to ? 1 : 0) + (state.range.grouping ? 1 : 0);
  const saveDisabledReason = state.loading ? 'Espera a que termine la consulta.' : state.error
    ? 'Actualiza la consulta antes de guardar un reporte.' : !state.filters?.campusIds.length ? 'Elige al menos un campus en Filtros.' : undefined;
  const consult = () => state.consult(state.range.from, state.range.to, state.range.grouping);
  const filtersDisabledReason = !state.options ? state.error ? 'Actualiza la consulta para cargar los filtros.' : 'Cargando filtros…' : undefined;
  return <AnalyticsPage refresh={{ onRefresh: consult, refreshing: state.loading,
    enabled: state.allowed && !state.loading && !state.reportRequested && !state.report && filterIdentity !== state.identityKey,
    label: 'la consulta de analítica' }}>
    <View style={v.context}>
      <View style={v.contextActions}>
      {state.allowed && state.report && <AnalyticsButton quiet disabled={state.loading} disabledReason="Espera a que termine la consulta." onPress={consult}
        hint="Consulta las cifras actuales sin modificar el reporte guardado." icon={<ArrowLeft size={16} color={c.PRIMARY} />}>Volver a consulta actual</AnalyticsButton>}
      <View style={v.filtersControl}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Abrir filtros de analítica, ${activeFilters} filtros activos`}
          accessibilityState={{ disabled: !state.options }} accessibilityHint={filtersDisabledReason ?? 'Cambiar campus, carrera, fechas y agrupación.'} disabled={!state.options}
          onPress={() => setFilterIdentity(state.identityKey)} style={[s.filtersButton, !state.options && s.disabled]}>
          <SlidersHorizontal size={17} color={c.PRIMARY} aria-hidden />
          <View style={s.filterCount}><Text style={s.filterCountText}>{activeFilters}</Text></View>
        </Pressable>
        {!!filtersDisabledReason && <Text style={s.small}>{filtersDisabledReason}</Text>}
      </View>
      </View>
      <AppliedFiltersSummary identityKey={state.identityKey} rows={contextRows}
        summary={`${institutionLabel} · ${campusLabel} · ${compactPeriodLabel(contextPeriod)}`}
        hint={`${institutionLabel}. ${campusLabel}. ${periodLabel(contextPeriod)}. Muestra sede, carreras, período y agrupación de los datos consultados.`} />
    </View>
    {state.allowed && !state.loading && !state.error && dashboard && <AnalyticsResults key={`results-${state.identityKey}`} dashboard={dashboard} report={state.report}
      onEditFilters={state.report || !state.options ? undefined : () => setFilterIdentity(state.identityKey)} />}
    {state.loading && <AnalyticsSkeleton label={state.reportRequested ? 'Generando reporte' : 'Cargando indicadores'} />}
    {!state.allowed && <AnalyticsMessage title="Acceso a analítica">{copy.states.permission}</AnalyticsMessage>}
    {!!state.error && <View style={s.stack}>
      <AnalyticsMessage error title={state.reportRequested ? 'Revisa tus reportes guardados' : 'No pudimos cargar las cifras'} onRetry={state.reportRequested ? undefined : consult}>{state.reportRequested ? copy.states.generation : copy.states.error}</AnalyticsMessage>
      {state.reportRequested && <Link href="/(analytics)/history" style={s.link}>Revisar Reportes guardados</Link>}
    </View>}
    {state.allowed && <View style={v.saveActions}>
      <Pressable accessibilityRole="button" accessibilityLabel={state.report ? 'Guardar otro reporte' : 'Guardar reporte'}
        accessibilityState={{ disabled: !!saveDisabledReason }} disabled={!!saveDisabledReason}
        accessibilityHint={saveDisabledReason ?? 'Vuelve a calcular con estos filtros y guarda un nuevo reporte permanente.'}
        onPress={() => state.generateReport(state.range.from, state.range.to, state.range.grouping)}
        style={StyleSheet.flatten([v.saveButton, !!saveDisabledReason && s.disabled])}>
        <FilePlus2 size={17} color="#FFFFFF" aria-hidden />
        <Text style={v.saveButtonText}>{state.report ? 'Guardar otro reporte' : 'Guardar reporte'}</Text>
      </Pressable>
      {!!saveDisabledReason && <Text style={s.small}>{saveDisabledReason}</Text>}
    </View>}
    {state.allowed && state.options && filterIdentity === state.identityKey && <AnalyticsFilters key={`filters-${state.identityKey}`} options={state.options}
      value={{ ...state.filters, ...state.range }} onClose={() => setFilterIdentity(null)} onApply={value => {
        state.applyQuery({ institutionId: value.institutionId!, campusIds: value.campusIds!, careerId: value.careerId }, value.from!, value.to!, value.grouping!);
        setFilterIdentity(null);
      }} />}
  </AnalyticsPage>;
}

const v = StyleSheet.create({
  context: { gap: 10 },
  contextActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 12 },
  filtersControl: { alignItems: 'flex-end', gap: 4, maxWidth: '100%' },
  saveActions: { gap: 8, paddingTop: 8 },
  saveButton: { width: '100%', maxWidth: '100%', minHeight: 44, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.PRIMARY },
  saveButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14, lineHeight: 21, flexShrink: 1, textAlign: 'center' },
});
