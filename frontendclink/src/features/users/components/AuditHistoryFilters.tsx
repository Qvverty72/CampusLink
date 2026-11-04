import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CalendarDays, ChevronDown, MapPinned, Search, SlidersHorizontal } from 'lucide-react-native';
import { FilterSheet, ui, CATALOG_COLORS as colors } from '@/features/marketplace/components/CatalogUI';
import { SearchableFilterSelect } from '@/features/marketplace/components/SearchableFilterSelect';
import { AUDIT_ACTIONS, auditLabels, EMPTY_AUDIT_SEARCH, type AuditSearch } from '../types/audit';
import { ActivityDateTimeField } from '@/features/activities/components/ActivityDateTimeField';
import { auditDateRangeError, auditDateRangeLabel, EMPTY_AUDIT_DATES, type AuditDateRange } from '../utils/auditDateRange';

const actionOptions = AUDIT_ACTIONS.map(id => ({ id, name: auditLabels[id] }));

type FilterSummaryProps = {
  campuses: { id: string; name: string }[]; campusId: string; action: string; dates: AuditDateRange; search: AuditSearch;
};

/** Resumen del contexto visible del registro, independiente del botón que abre los filtros. */
export function AuditHistoryFilterSummary({ campuses, campusId, action, dates, search }: FilterSummaryProps) {
  const campusName = campuses.find(campus => campus.id === campusId)?.name;
  const summary = [campusName,action ? auditLabels[action] ?? action : 'Todas las acciones',
    dates.from || dates.to ? auditDateRangeLabel(dates) : '',search.contentName ? `Contenido: ${search.contentName}` : '',search.userName ? `Usuario: ${search.userName}` : ''].filter(Boolean).join(' · ');
  return <View style={styles.summary}>
    <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.campusIcon}>
      <MapPinned size={16} color={colors.muted} />
    </View>
    <Text style={styles.summaryText} accessibilityLabel={`Campus: ${summary}`}>{summary}</Text>
  </View>;
}

/** Usa los mismos selectores y panel de filtros que los catálogos del proyecto. */
export function AuditHistoryFilters({ campuses, campusId, action, dates, search, onChange }: FilterSummaryProps & {
  onChange: (campusId: string, action: string, dates: AuditDateRange, search?: AuditSearch) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<'campus' | 'action' | 'date' | null>(null);
  const [draft, setDraft] = useState(dates);
  const [draftSearch, setDraftSearch] = useState(search);
  const dateError = auditDateRangeError(draft);
  const hasDates = !!(dates.from || dates.to);
  const count = Number(!!action) + Number(hasDates) + Number(!!search.contentName) + Number(!!search.userName);
  const close = () => { setVisible(false); setExpanded(null); };
  const applySearch = () => { onChange(campusId,action,dates,draftSearch); close(); };
  return <View style={styles.group}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir filtros del historial" accessibilityState={{ expanded: visible }} aria-expanded={visible}
      accessibilityHint={count ? `${count} filtros activos. Abre las opciones para modificarlos.` : 'Abre las opciones de campus, acción, fecha y búsqueda.'}
      activeOpacity={0.65} style={styles.iconTrigger} onPress={() => { setDraft(dates); setDraftSearch(search); setExpanded(null); setVisible(true); }}>
      <SlidersHorizontal size={22} color={colors.primary} accessible={false} aria-hidden />
    </TouchableOpacity>
    <FilterSheet visible={visible} title="Filtros del historial" onClose={close} onConfirm={applySearch} confirmLabel={expanded === 'date' ? null : 'Ver resultados'} fillHeight compact preferredHeight={640}>
      <SearchableFilterSelect label="Campus" options={campuses} value={campusId} onChange={id => onChange(id, action, dates)}
        allowEmpty={false} searchable={false} expanded={expanded === 'campus'} onExpandedChange={open => setExpanded(open ? 'campus' : null)} />
      <View style={styles.searchGroup}>
        <View style={styles.searchField}>
          <Text style={ui.label}>Nombre del contenido</Text>
          <Text style={styles.hint}>Busca una actividad, evento oficial o recurso.</Text>
          <View style={[ui.input,styles.searchBox]}>
            <View accessible={false} aria-hidden><Search size={17} color={colors.muted} /></View>
            <TextInput accessibilityLabel="Buscar por nombre del contenido" placeholder="Ej. Feria de empleo o libro de cálculo" placeholderTextColor={colors.muted}
              value={draftSearch.contentName} onChangeText={contentName=>setDraftSearch(current=>({...current,contentName}))}
              maxLength={100} autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={applySearch} style={styles.searchInput} />
          </View>
        </View>
        <View style={styles.searchField}>
          <Text style={ui.label}>Nombre del usuario responsable</Text>
          <View style={[ui.input,styles.searchBox]}>
            <View accessible={false} aria-hidden><Search size={17} color={colors.muted} /></View>
            <TextInput accessibilityLabel="Buscar por nombre del usuario responsable" placeholder="Ej. Carlos Soto" placeholderTextColor={colors.muted}
              value={draftSearch.userName} onChangeText={userName=>setDraftSearch(current=>({...current,userName}))}
              maxLength={100} autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={applySearch} style={styles.searchInput} />
          </View>
        </View>
        <Text style={styles.hint}>Puedes escribir parte del nombre. Aplica la búsqueda con Ver resultados.</Text>
        {!!(draftSearch.contentName || draftSearch.userName || search.contentName || search.userName) && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Limpiar búsqueda por nombres"
          style={styles.clear} onPress={()=>{setDraftSearch(EMPTY_AUDIT_SEARCH);onChange(campusId,action,dates,EMPTY_AUDIT_SEARCH);}}>
          <Text style={ui.link}>Limpiar búsqueda</Text>
        </TouchableOpacity>}
      </View>
      <SearchableFilterSelect label="Tipo de acción" options={actionOptions} value={action} onChange={value => onChange(campusId, value, dates)}
        placeholder="Todas las acciones" emptyLabel="Todas las acciones" searchable={false}
        expanded={expanded === 'action'} onExpandedChange={open => setExpanded(open ? 'action' : null)} />
      <View style={styles.dateGroup}>
        <Text style={ui.label}>Fecha</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Seleccionar fechas del historial" accessibilityState={{ expanded: expanded === 'date' }}
          aria-expanded={expanded === 'date'} activeOpacity={0.65} style={[ui.input, styles.dateTrigger]}
          onPress={() => { setDraft(dates); setExpanded(expanded === 'date' ? null : 'date'); }}>
          <CalendarDays size={18} color={colors.primary} accessible={false} aria-hidden />
          <Text style={styles.dateValue}>{auditDateRangeLabel(dates)}</Text>
          <ChevronDown size={16} color={colors.muted} accessible={false} aria-hidden />
        </TouchableOpacity>
        {expanded === 'date' && <View style={styles.dateGroup}>
          <Text style={styles.hint}>Incluye ambos días completos, según la zona horaria de tu dispositivo. Puedes elegir solo Desde o Hasta.</Text>
          <View style={styles.dateFields}>
            <View style={styles.dateField}><ActivityDateTimeField label="Desde" mode="date" value={draft.from} disabled={!visible}
              onChange={from => setDraft(current => ({ ...current, from }))} /></View>
            <View style={styles.dateField}><ActivityDateTimeField label="Hasta" mode="date" value={draft.to} disabled={!visible}
              onChange={to => setDraft(current => ({ ...current, to }))} /></View>
          </View>
          {!!dateError && <Text accessibilityRole="alert" style={styles.error}>{dateError}</Text>}
          <View style={styles.dateActions}>
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.65} style={styles.clear} onPress={() => setDraft(EMPTY_AUDIT_DATES)}>
              <Text style={ui.link}>Limpiar fechas</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!dateError }} disabled={!!dateError}
              activeOpacity={0.65} style={[styles.apply, !!dateError && styles.disabled]}
              onPress={() => { onChange(campusId, action, draft, draftSearch); close(); }}>
              <Text style={styles.applyText}>Aplicar fechas</Text>
            </TouchableOpacity>
          </View>
        </View>}
      </View>
      {hasDates && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quitar filtro de fecha" activeOpacity={0.65}
        style={styles.clear} onPress={() => { setDraft(EMPTY_AUDIT_DATES); setExpanded(null); onChange(campusId, action, EMPTY_AUDIT_DATES); }}>
        <Text style={ui.link}>Quitar filtro de fecha</Text>
      </TouchableOpacity>}
      {!!action && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quitar filtro de acción" activeOpacity={0.65}
        style={styles.clear} onPress={() => { setExpanded(null); onChange(campusId, '', dates); }}>
        <Text style={ui.link}>Quitar filtro de acción</Text>
      </TouchableOpacity>}
    </FilterSheet>
  </View>;
}

const styles = StyleSheet.create({
  group: { flexShrink: 0 }, iconTrigger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  campusIcon: { paddingTop: 1 }, summaryText: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 12, lineHeight: 19 },
  searchGroup: { gap: 12 }, searchField: { gap: 7 }, searchBox: { flexDirection:'row',alignItems:'center',gap:8 },
  searchInput: { flex:1,minWidth:0,padding:0,fontSize:14,lineHeight:20,color:colors.ink },
  clear: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  dateGroup: { gap: 10 }, dateTrigger: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  dateValue: { flex: 1, flexShrink: 1, color: colors.primary, fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, dateField: { flex: 1, minWidth: 130 },
  dateActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  apply: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 12, justifyContent: 'center' },
  applyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }, disabled: { opacity: 0.45 },
  error: { color: '#9B3C24', fontSize: 12, lineHeight: 18 },
});
