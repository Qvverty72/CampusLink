import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, MapPinned, ShieldCheck, SlidersHorizontal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { Pagination } from '@/components/Pagination';
import { useReportReviews } from '../hooks/useReportReviews';
import { AppliedFiltersSummary } from '@/features/analytics/components/AppliedFiltersSummary';
import { ReportFilters, reportEntityTypeLabel, reportFilterLabel } from './ReportFilters';
import { ReportCaseDetail } from './ReportCaseDetail';
import { ReportReviewCard } from './ReportReviewCard';
import { focusReport, ReportButton, ReportIcon, ReportLoading, ReportStateMessage, type ReportFocusTarget } from './ReportUI';
import { reportStyles as s, reportColors as c } from './reports.styles';

/** Composición administrativa; el hook conserva toda coordinación y autorización remota. */
export function ReportReviews() {
  const review = useReportReviews(), insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null), scrollY = useRef(0), listY = useRef(0);
  const titleRef = useRef<ComponentRef<typeof Text>>(null);
  const triggers = useRef(new Map<string, ReportFocusTarget>()), lastOpened = useRef<string | null>(null), previousSelected = useRef<string | undefined>(undefined);
  const webEntry = useRef(false), webTransition = useRef<(() => void) | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<ReportFocusTarget>(null);
  const closeFilters = () => { setFiltersOpen(false); requestAnimationFrame(() => focusReport(filterTrigger.current)); };
  const [pendingLeave, setPendingLeave] = useState<{ leave: () => void; stay?: () => void } | null>(null);
  const campusName = review.campuses.find(row => row.id === review.campusId)?.name ?? 'Campus';
  const activeFilterCount = Number(!!review.statusFilter) + Number(!!review.entityTypeFilter);
  const clearFilters = () => review.applyFilters({ campusId: review.campusId, status: '', entityType: '' });
  const pushWebEntry = () => {
    if (Platform.OS === 'web') { window.history.pushState({ ...window.history.state, campuslinkReport: true }, ''); webEntry.current = true; }
  };
  const clearWebEntry = (then: () => void) => {
    if (Platform.OS === 'web' && webEntry.current) { webEntry.current = false; webTransition.current = then; window.history.back(); }
    else then();
  };
  const attemptLeave = (leave: () => void, stay?: () => void) => {
    if (review.resolving) { stay?.(); return; }
    if (review.hasResolutionDraft && !review.resolutionNeedsReload) setPendingLeave({ leave, stay });
    else leave();
  };
  const close = () => attemptLeave(() => clearWebEntry(review.close));
  useEffect(() => {
    if (review.selectedId && review.selectedId !== previousSelected.current) scroll.current?.scrollTo({ y: 0, animated: false });
    if (!review.selectedId && previousSelected.current) {
      const id = lastOpened.current;
      const frame = requestAnimationFrame(() => { scroll.current?.scrollTo({ y: listY.current, animated: false }); focusReport((id ? triggers.current.get(id) : null) ?? filterTrigger.current); });
      previousSelected.current = undefined;
      return () => cancelAnimationFrame(frame);
    }
    previousSelected.current = review.selectedId;
  }, [review.selectedId]);
  useEffect(() => { if (review.detail) { const frame = requestAnimationFrame(() => focusReport(titleRef.current)); return () => cancelAnimationFrame(frame); } }, [review.detail?.id, review.detail?.status]);
  useEffect(() => {
    setFiltersOpen(false); setPendingLeave(null); listY.current = 0; lastOpened.current = null;
    if (webEntry.current) clearWebEntry(() => {});
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [review.identityKey, review.accessDenied]);
  useEffect(() => {
    const native = BackHandler.addEventListener('hardwareBackPress', () => { if (filtersOpen) { closeFilters(); return true; } if (!review.selectedId) return false; close(); return true; });
    if (Platform.OS !== 'web') return () => native.remove();
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (pendingLeave) { pendingLeave.stay?.(); setPendingLeave(null); }
      else if (filtersOpen) closeFilters();
      else if (review.confirmingResolution && !review.resolving) review.cancelResolution();
      else if (review.selectedId) close();
    };
    const pop = () => {
      if (webTransition.current) { const then = webTransition.current; webTransition.current = null; then(); return; }
      if (review.selectedId) { webEntry.current = false; attemptLeave(review.close, pushWebEntry); }
    };
    window.addEventListener('keydown', key); window.addEventListener('popstate', pop);
    return () => { native.remove(); window.removeEventListener('keydown', key); window.removeEventListener('popstate', pop); };
  });
  const open = (id: string) => {
    lastOpened.current = id; listY.current = scrollY.current; pushWebEntry(); review.open(id);
  };
  const navigate = (action: () => void) => attemptLeave(() => clearWebEntry(() => { setFiltersOpen(false); action(); scroll.current?.scrollTo({ y: 0, animated: false }); }));
  return <View style={s.screen}>
    <ScrollView ref={scroll} style={s.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop: safeAreaInset('top', insets.top, { min: 12, offset: 8 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 16, base: 24 }),
        paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }) }}>
      <View style={s.content}>
        <View style={s.smallStack}>
          <View style={s.between}><Pressable accessibilityRole="link" style={StyleSheet.flatten(s.back)} onPress={() => navigate(() => router.push('/profile'))} disabled={review.resolving}>
            <ReportIcon icon={ArrowLeft} color={c.PRIMARY} /><Text style={s.linkText}>Mi perfil</Text>
          </Pressable><Text style={s.eyebrow}>ADMINISTRACIÓN</Text></View>
          <Text accessibilityRole="header" style={review.selectedId ? s.heading : s.title}>{review.selectedId ? 'Detalle de denuncia' : 'Denuncias de contenido'}</Text>
          {!review.selectedId && <Text style={s.muted}>Revisa lo ocurrido y toma una decisión con sus antecedentes a la vista.</Text>}
        </View>
        {!!review.accessDenied ? <ReportStateMessage title="Tu acceso cambió" error onRetry={review.retry} action="Actualizar acceso">{review.accessDenied}</ReportStateMessage>
          : !review.allowed ? <ReportStateMessage title="Acceso administrativo requerido" icon={ShieldCheck}>Necesitas una cuenta administradora con acceso a este campus para consultar las denuncias.</ReportStateMessage>
          : <>
            {review.catalogLoading ? <ReportLoading /> : review.catalogError ? <ReportStateMessage title="No pudimos cargar tus campus" error onRetry={review.retry}>{review.catalogError}</ReportStateMessage>
              : !review.campuses.length ? <ReportStateMessage title="Sin campus disponibles" icon={MapPinned} onRetry={review.retry} action="Actualizar campus">Tu cuenta no tiene campus disponibles para esta consulta. Revisa tus asignaciones administrativas.</ReportStateMessage>
                : <>
                  {review.selectedId ? <View style={[s.stack, s.detailContent]}>
                    {review.detailLoading ? <ReportLoading detail /> : review.detailError ? <ReportStateMessage title="No pudimos abrir la denuncia" error onRetry={review.retry}>{review.detailError}</ReportStateMessage>
                      : review.detail && <ReportCaseDetail key={`${review.identityKey}:${review.campusId}:${review.detail.id}`} review={review} campusName={campusName} titleRef={titleRef} />}
                    <ReportButton secondary disabled={review.resolving} onPress={close} icon={ArrowLeft}>Volver al listado</ReportButton>
                  </View> : <View style={s.stack}>
                    <View style={s.between}>
                      <View style={s.grow}><Text accessibilityRole="header" style={s.sectionTitle}>Denuncias del campus</Text><Text accessibilityLiveRegion="polite" style={s.small}>Página {review.page}</Text></View>
                      <Pressable ref={filterTrigger} accessibilityRole="button" accessibilityLabel="Filtros de denuncias" accessibilityState={{ expanded: filtersOpen }} aria-expanded={filtersOpen}
                        style={s.filterTrigger} onPress={() => setFiltersOpen(true)}>
                        <ReportIcon icon={SlidersHorizontal} size={17} /><Text style={s.linkText}>Filtros</Text>
                        {!!activeFilterCount && <View style={s.filterBadge}><Text style={s.filterCount}>{activeFilterCount}</Text></View>}
                      </Pressable>
                    </View>
                    <AppliedFiltersSummary identityKey={`${review.identityKey}:${review.campusId}:${review.statusFilter}:${review.entityTypeFilter}`}
                      summary={`${campusName} · ${reportFilterLabel(review.statusFilter)}${review.entityTypeFilter ? ` · ${reportEntityTypeLabel(review.entityTypeFilter)}` : ''}`}
                      rows={[["Campus", campusName], ["Estado", reportFilterLabel(review.statusFilter)], ["Tipo de contenido", reportEntityTypeLabel(review.entityTypeFilter)]]}
                      hint="Muestra el campus, el estado y el tipo de contenido aplicados a toda la consulta." />
                    {!!activeFilterCount && <Pressable accessibilityRole="button" style={s.back} onPress={clearFilters}><Text style={s.linkText}>Limpiar filtros</Text></Pressable>}
                    {review.listLoading ? <ReportLoading /> : review.listError ? <ReportStateMessage title="No pudimos cargar las denuncias" error onRetry={review.retry}>{review.listError}</ReportStateMessage>
                      : !review.entries.length ? <ReportStateMessage title={activeFilterCount ? "Sin denuncias con estos filtros" : "No hay denuncias en este campus"}
                          onRetry={activeFilterCount ? clearFilters : undefined} action="Ver todas las denuncias">
                          {activeFilterCount ? "Prueba con otro estado o tipo de contenido, o consulta todas las denuncias de este campus." : "Aquí aparecerán los casos enviados para que la administración pueda revisarlos."}</ReportStateMessage>
                        : <View style={s.caseList}>{review.entries.map(entry => <ReportReviewCard key={entry.id} entry={entry} onOpen={() => open(entry.id)} ref={node => { if (node) triggers.current.set(entry.id, node); else triggers.current.delete(entry.id); }} />)}</View>}
                    {!review.listError && <Pagination page={review.page} visitedPages={review.visitedPages} hasNextPage={review.hasMore} showSinglePage disabled={review.listLoading} onPageChange={page => {
                      scroll.current?.scrollTo({ y: 0, animated: false }); review.changePage(page);
                    }} label="Paginación de denuncias" />}
                  </View>}
                </>}
          </>}
      </View>
    </ScrollView>
    {filtersOpen && review.allowed && !review.accessDenied && !review.selectedId && !!review.campuses.length && <ReportFilters
      key={review.identityKey} campuses={review.campuses} campusId={review.campusId} status={review.statusFilter} entityType={review.entityTypeFilter} onClose={closeFilters}
      onApply={filters => { review.applyFilters(filters); closeFilters(); listY.current = 0; scroll.current?.scrollTo({ y: 0, animated: false }); }} />}
    <Modal visible={!!pendingLeave} transparent animationType="fade" onRequestClose={() => { pendingLeave?.stay?.(); setPendingLeave(null); }}>
      <View style={{ flex: 1, backgroundColor: '#102C4380', justifyContent: 'center', padding: 24 }} accessibilityViewIsModal>
        <View style={[s.card, { width: '100%', maxWidth: 440, alignSelf: 'center' }]}><Text accessibilityRole="header" style={s.sectionTitle}>¿Salir sin registrar la decisión?</Text>
          <Text style={s.body}>Tu selección y justificación todavía no se han enviado. Si sales, se descartarán.</Text>
          <ReportButton onPress={() => { pendingLeave?.stay?.(); setPendingLeave(null); }}>Seguir revisando</ReportButton>
          <ReportButton secondary onPress={() => { const leave = pendingLeave?.leave; setPendingLeave(null); leave?.(); }}>Descartar borrador y salir</ReportButton>
        </View>
      </View>
    </Modal>
  </View>;
}
