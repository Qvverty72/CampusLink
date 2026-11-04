import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Search, Square, SquareCheck } from 'lucide-react-native';
import { Text, TextInput, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { FilterSheet } from '@/features/marketplace/components/CatalogUI';
import { SearchableFilterSelect } from '@/features/marketplace/components/SearchableFilterSelect';
import { ActivityDateTimeField } from '@/features/activities/components/ActivityDateTimeField';
import type { DashboardOptions, HistoricalReportsFilters } from '../types/dashboard';
import { civilValue, monthRange, pickerValue, rangeError } from '../utils/presentation';
import { ANALYTICS_COPY as copy } from '../utils/copy';
import { AnalyticsButton } from './AnalyticsUI';
import { colors as c, styles as s } from './analytics.styles';

/** Todo el panel es un borrador: cerrar no modifica la consulta aplicada. */
export function AnalyticsFilters({ value, options, historical = false, onApply, onClose }: {
  value: HistoricalReportsFilters; options: DashboardOptions | null; historical?: boolean;
  onApply: (value: HistoricalReportsFilters, feedback: { careerCleared: boolean }) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...value, campusIds: [...(value.campusIds ?? [])] }));
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [expanded, setExpanded] = useState<'institution' | 'campus' | 'career' | null>(null);
  const { fontScale = 1 } = useWindowDimensions();
  const [notice, setNotice] = useState('');
  const [careerCleared, setCareerCleared] = useState(false);
  const clearCareerNotice = () => { setNotice(''); setCareerCleared(false); };
  const institution = options?.institutions.find(row => row.id === (draft.institutionId ?? options.institutions[0]?.id));
  const careers = institution?.careers.filter(row => !draft.campusIds.length || row.campusIds.some(id => draft.campusIds.includes(id))) ?? [];
  const campuses = institution?.campuses.filter(row => row.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))) ?? [];
  const selectedCampuses = institution?.campuses.filter(row => draft.campusIds.includes(row.id)) ?? [];
  const campusLabel = draft.campusIds.length === 1 ? selectedCampuses[0]?.name ?? '1 campus seleccionado'
    : draft.campusIds.length ? `${draft.campusIds.length} campus seleccionados` : historical ? 'Todos los autorizados' : 'Seleccionar campus';
  const error = rangeError(draft.from ?? '', draft.to ?? '', historical)
    || (!historical && !draft.campusIds.length ? 'Selecciona al menos un campus.' : '')
    || (!historical && !institution ? 'Espera a que se carguen tus opciones autorizadas.' : '');
  const selectCampus = (id: string) => {
    const campusIds = draft.campusIds.includes(id) ? draft.campusIds.filter(item => item !== id) : [...draft.campusIds, id];
    const career = institution?.careers.find(row => row.id === draft.careerId);
    const validCareer = !career || (historical && !campusIds.length) || career.campusIds.some(id => campusIds.includes(id));
    setDraft({ ...draft, campusIds, careerId: validCareer ? draft.careerId : undefined });
    if (!validCareer) { setNotice(copy.careerCleared); setCareerCleared(true); }
  };
  const apply = () => {
    if (error) return;
    onApply({ ...draft, institutionId: draft.institutionId ?? institution?.id,
      from: draft.from || undefined, to: draft.to || undefined }, { careerCleared });
  };
  const clear = () => {
    const campusId = institution?.campuses[0]?.id;
    setDraft(historical ? { campusIds: [] } : { institutionId: institution?.id, campusIds: campusId ? [campusId] : [], ...monthRange(), grouping: 'month' });
    clearCareerNotice(); setExpanded(null); setSearch(''); setLimit(20);
  };
  const actions = <View style={f.actionsGroup}>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={f.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Limpiar filtros"
        accessibilityHint={historical ? 'Quita los filtros del borrador. Pulsa Guardar filtros para consultar.' : 'Restablece el mes actual, el primer campus autorizado y todas las carreras. Pulsa Guardar filtros para consultar.'}
        onPress={clear} style={f.clear}><Text style={f.clearText}>Limpiar</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Guardar filtros" accessibilityHint={error || 'Confirma todos los cambios y consulta los resultados.'}
        accessibilityState={{ disabled: !!error }} disabled={!!error} onPress={apply}
        style={[f.apply, !!error && s.disabled]}><Text style={f.applyText}>Guardar filtros</Text></Pressable>
    </View>
  </View>;
  return <FilterSheet visible title={historical ? 'Filtros de reportes' : 'Filtros de analítica'}
    onClose={onClose} confirmLabel={null} fillHeight compact preferredHeight={760} sheetStyle={f.sheet}>
    {options && options.institutions.length > 1 ? <SearchableFilterSelect label="Institución" value={institution?.id ?? ''} options={options.institutions}
      allowEmpty={false} expanded={expanded === 'institution'} onExpandedChange={open => setExpanded(open ? 'institution' : null)}
      onChange={institutionId => { const row = options.institutions.find(row => row.id === institutionId)!;
        if (draft.careerId) { setCareerCleared(true); setNotice(copy.careerCleared); }
        setDraft({ ...draft, institutionId, campusIds: historical || !row.campuses[0] ? [] : [row.campuses[0].id], careerId: undefined }); }} />
      : null}
    <View style={f.field}>
      <Text style={s.label}>Campus</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar campus" accessibilityValue={{ text: campusLabel }}
        accessibilityState={{ expanded: expanded === 'campus', disabled: !institution }} disabled={!institution} aria-expanded={expanded === 'campus'}
        onPress={() => { setExpanded(expanded === 'campus' ? null : 'campus'); setSearch(''); setLimit(20); }} style={[f.trigger, expanded === 'campus' && f.open]}>
        <Text style={[s.body, s.grow]}>{campusLabel}</Text>{expanded === 'campus' ? <ChevronUp size={17} color={c.PRIMARY} aria-hidden /> : <ChevronDown size={17} color={c.PRIMARY} aria-hidden />}
      </Pressable>
      {expanded === 'campus' && <View style={f.menu}>
      {(institution?.campuses.length ?? 0) > 6 && <View style={f.search}><Search size={17} color={c.muted} aria-hidden /><TextInput accessibilityLabel="Buscar campus" placeholder="Buscar campus" value={search}
        onChangeText={value => { setSearch(value); setLimit(20); }} style={f.searchInput} /></View>}
      {campuses.slice(0, limit).map(row => {
        const checked = draft.campusIds.includes(row.id);
        return <Pressable key={row.id} accessibilityRole="checkbox" accessibilityLabel={row.name} accessibilityState={{ checked }}
          onPress={() => selectCampus(row.id)} style={[f.option, checked && f.selected]}>
          {checked ? <SquareCheck size={20} color={c.PRIMARY} aria-hidden /> : <Square size={20} color={c.muted} aria-hidden />}<Text style={[s.body, s.grow]}>{row.name}</Text>
        </Pressable>;
      })}
      {campuses.length > limit && <AnalyticsButton quiet onPress={() => setLimit(count => count + 20)}>Mostrar más campus</AnalyticsButton>}
      {search && !campuses.length ? <Text style={s.small}>No hay campus que coincidan.</Text> : null}
      </View>}
      {historical && <Text style={s.small}>Sin selección se incluyen todos tus ámbitos autorizados, también los históricos.</Text>}
      {!institution && historical && <Text style={s.small}>El catálogo actual no está disponible. Puedes consultar los reportes históricos sin este filtro.</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={s.small}>{notice}</Text>}
    </View>
    {institution && <SearchableFilterSelect label="Carrera" options={careers} value={draft.careerId ?? ''} onChange={careerId => { setDraft({ ...draft, careerId: careerId || undefined }); clearCareerNotice(); }}
      emptyLabel={copy.allCareers} placeholder="Todas las carreras · incl. sin clasificar" expanded={expanded === 'career'} onExpandedChange={open => setExpanded(open ? 'career' : null)} />}
    <View style={f.field}>
      {historical && <Text style={s.small}>Fechas opcionales</Text>}
      <View style={f.dates}>
        <View style={{ flexGrow: 1, flexBasis: fontScale > 1.3 ? '100%' : 120, minWidth: 0 }}><ActivityDateTimeField label="Desde" mode="date" compact trailingIcon={<CalendarDays size={16} color={c.PRIMARY} aria-hidden />} value={pickerValue(draft.from ?? '')} disabled={false}
          onChange={value => setDraft({ ...draft, from: civilValue(value) })} /></View>
        <View style={{ flexGrow: 1, flexBasis: fontScale > 1.3 ? '100%' : 120, minWidth: 0 }}><ActivityDateTimeField label="Hasta" mode="date" compact trailingIcon={<CalendarDays size={16} color={c.PRIMARY} aria-hidden />} value={pickerValue(draft.to ?? '')} disabled={false}
          onChange={value => setDraft({ ...draft, to: civilValue(value) })} /></View>
      </View>
    </View>
    <View style={f.field}><Text style={s.label}>Agrupar por</Text><View accessibilityRole="radiogroup" accessibilityLabel="Agrupar por" style={f.segment}>
      {(historical ? [undefined, 'week', 'month'] as const : ['week', 'month'] as const).map(grouping => <Pressable key={grouping ?? 'all'} accessibilityRole="radio"
        accessibilityLabel={grouping === 'week' ? 'Semana (lunes a domingo)' : grouping === 'month' ? 'Mes calendario' : 'Todas las agrupaciones'}
        accessibilityState={{ checked: draft.grouping === grouping }} onPress={() => setDraft({ ...draft, grouping })} style={[f.segmentOption, draft.grouping === grouping && f.segmentActive]}>
        <Text style={s.link}>{grouping === 'week' ? 'Semana' : grouping === 'month' ? 'Mes' : 'Todas'}</Text>
      </Pressable>)}
    </View><Text style={s.small}>Semanas de lunes a domingo, según calendario de Chile.</Text></View>
    {actions}
  </FilterSheet>;
}

const f = StyleSheet.create({
  sheet: { maxWidth: 480, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  field: { gap: 8 }, trigger: { minHeight: 44, borderWidth: 1, borderColor: '#B6C6D2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  open: { borderColor: c.PRIMARY }, menu: { borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: 'hidden' },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }, selected: { backgroundColor: c.tint },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 14, color: c.ink },
  dates: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  segment: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.tint, padding: 3, borderRadius: 12, gap: 3 },
  segmentOption: { flex: 1, minWidth: 70, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 9, borderWidth: 1, borderColor: 'transparent' },
  segmentActive: { backgroundColor: '#FFFFFF', borderColor: c.border, elevation: 1, boxShadow: '0px 1px 3px rgba(0,46,86,0.12)' },
  actionsGroup: { gap: 8, paddingTop: 4 },
  actions: { alignItems: 'center', gap: 12 },
  clear: { width: '100%', maxWidth: '100%', minHeight: 44, borderWidth: 1, borderColor: c.PRIMARY, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  clearText: { color: c.PRIMARY, fontWeight: '600', fontSize: 14, lineHeight: 21 },
  apply: { width: '100%', maxWidth: '100%', minHeight: 44, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.PRIMARY },
  applyText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14, lineHeight: 21 },
});
