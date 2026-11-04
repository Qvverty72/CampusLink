import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MapPinned, Search, SlidersHorizontal } from 'lucide-react-native';
import { FilterSheet, ui, CATALOG_COLORS as colors } from '@/features/marketplace/components/CatalogUI';
import { SearchableFilterSelect } from '@/features/marketplace/components/SearchableFilterSelect';

type FilterProps = {
  campuses: { id: string; name: string }[]; campusId: string; search: string;
};

/** Resumen y disparador mantienen el mismo lenguaje visual que el Historial administrativo. */
export function CampusAccessFilterSummary({ campuses, campusId, search }: FilterProps) {
  const name = campuses.find(row => row.id === campusId)?.name ?? 'Campus';
  const summary = search ? `${name} · Búsqueda: ${search}` : name;
  return <View style={styles.summary}>
    <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.campusIcon}><MapPinned size={16} color={colors.muted} /></View>
    <Text accessibilityLabel={`Campus: ${summary}`} style={styles.summaryText}>{summary}</Text>
  </View>;
}

export function CampusAccessFilters({ campuses, campusId, search, visible, setVisible, disabled, onChange }: FilterProps & {
  visible: boolean; setVisible: (visible: boolean) => void; disabled: boolean; onChange: (id: string, search: string) => void;
}) {
  const [draftCampus, setDraftCampus] = useState(campusId);
  const [draftSearch, setDraftSearch] = useState(search);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const close = () => { setVisible(false); setExpanded(false); setError(''); };
  const apply = () => {
    if (!campuses.some(row => row.id === draftCampus)) { setError('Selecciona un campus disponible.'); return; }
    if (draftSearch.length > 254 || /[\u0000-\u001f\u007f]/.test(draftSearch)) { setError('Escribe un nombre o correo válido de hasta 254 caracteres.'); return; }
    onChange(draftCampus, draftSearch); close();
  };
  return <View style={styles.group}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir filtros de cuentas" accessibilityState={{ expanded: visible, disabled }} aria-expanded={visible}
      accessibilityHint={search ? 'Hay una búsqueda activa. Abre las opciones para modificarla.' : 'Abre las opciones de campus y búsqueda por nombre o correo.'}
      disabled={disabled} activeOpacity={0.65} style={[styles.iconTrigger, disabled && ui.disabled]}
      onPress={() => { setDraftCampus(campusId); setDraftSearch(search); setExpanded(false); setError(''); setVisible(true); }}>
      <SlidersHorizontal size={22} color={colors.primary} accessible={false} aria-hidden />
    </TouchableOpacity>
    <FilterSheet visible={visible} title="Filtros de cuentas" onClose={close} onConfirm={apply} fillHeight compact preferredHeight={440}>
      <SearchableFilterSelect label="Campus" options={campuses} value={draftCampus} onChange={setDraftCampus}
        allowEmpty={false} searchable={false} expanded={expanded} onExpandedChange={setExpanded} />
      <View style={styles.searchField}>
        <Text style={ui.label}>Nombre de perfil o correo</Text>
        <View style={[ui.input, styles.searchBox]}><View accessible={false} aria-hidden><Search size={17} color={colors.muted} /></View>
          <TextInput accessibilityLabel="Buscar cuentas por nombre o correo" value={draftSearch} onChangeText={value => { setDraftSearch(value); setError(''); }}
            placeholder="Ej. Camila Soto o camila@duocuc.cl" placeholderTextColor={colors.muted} maxLength={254}
            autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={apply} style={styles.searchInput} />
        </View>
        <Text style={styles.hint}>Busca por parte del nombre o del correo en el campus seleccionado.</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!draftSearch && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Limpiar búsqueda de cuentas" style={styles.clear} onPress={() => { setDraftSearch(''); setError(''); }}><Text style={ui.link}>Limpiar búsqueda</Text></TouchableOpacity>}
    </FilterSheet>
  </View>;
}

const styles = StyleSheet.create({
  group: { flexShrink: 0 }, iconTrigger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  summary: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 6 }, campusIcon: { paddingTop: 1 },
  summaryText: { flex: 1, minWidth: 0, color: colors.muted, fontSize: 12, lineHeight: 19 },
  searchField: { gap: 7 }, searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, padding: 0, fontSize: 14, lineHeight: 20, color: colors.ink },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 }, error: { color: '#9B3C24', fontSize: 12, lineHeight: 18 },
  clear: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
});
