import { useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react-native';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';

export type FilterSelectOption = { id: string; name: string; code?: string | null };
type Props = {
  label: string;
  options: readonly FilterSelectOption[];
  value: string;
  onChange: (id: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  searchRequired?: boolean;
  showLabel?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  clearLabel?: string;
};

/** Busca en el catálogo ya cargado; escribir nunca modifica el filtro ni llama a la API. */
export function SearchableFilterSelect({ label, options, value, onChange, expanded, onExpandedChange, disabled = false, loading = false, searchRequired = false, showLabel = true, placeholder = 'Cualquiera', allowEmpty = true, emptyLabel = 'Cualquiera', clearLabel = 'Quitar filtro' }: Props) {
  const selected = options.find(option => option.id === value);
  const unavailable = disabled || loading;
  const open = expanded && !unavailable;
  const display = loading ? 'Cargando opciones…' : selected?.name ?? (value ? 'Selección no disponible' : placeholder);
  return <View style={styles.group} onAccessibilityEscape={() => onExpandedChange(false)}>
    {showLabel && <Text style={ui.label}>{label}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Seleccionar ${label.toLowerCase()}`}
      accessibilityValue={{ text: display }} accessibilityState={{ expanded: open, disabled: unavailable }} aria-expanded={open}
      disabled={unavailable} onPress={() => onExpandedChange(!open)} style={[styles.trigger, open && styles.open, unavailable && ui.disabled]}>
      <Text style={[styles.value, !selected && styles.placeholder]}>{display}</Text>
      {loading ? <ActivityIndicator size="small" color={colors.secondary} /> : open ? <ChevronUp size={19} color={colors.secondary} /> : <ChevronDown size={19} color={colors.secondary} />}
    </Pressable>
    {open && <FilterSelectMenu searchRequired={searchRequired} allowEmpty={allowEmpty} emptyLabel={emptyLabel} clearLabel={clearLabel} label={label} options={options} value={value} onClose={() => onExpandedChange(false)} onSelect={id => {
      if (id !== value) onChange(id);
      onExpandedChange(false);
      Keyboard.dismiss();
    }} />}
  </View>;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

/** Al cerrar se desmonta: limpia búsqueda, paginación y temporizador de debounce. */
function FilterSelectMenu({ label, options, value, onSelect, onClose, searchRequired, allowEmpty, emptyLabel, clearLabel }: {
  allowEmpty: boolean; emptyLabel: string; clearLabel: string;
  searchRequired: boolean; label: string; options: readonly FilterSelectOption[]; value: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState(''), [limit, setLimit] = useState(20);
  const debouncedQuery = useDebouncedValue(query);
  const waitingForQuery = searchRequired && !normalize(query);
  const searching = !waitingForQuery && query !== debouncedQuery;
  const matches = useMemo(() => {
    const needle = normalize(debouncedQuery);
    if (searchRequired && !needle) return [];
    const matching = options.filter(option => normalize(`${option.name} ${option.code ?? ''}`).includes(needle));
    const selected = matching.find(option => option.id === value);
    return selected ? [selected, ...matching.filter(option => option.id !== value)] : matching;
  }, [options, value, debouncedQuery, searchRequired]);
  return <View style={styles.menu}>
    <View style={styles.search}>
      <Search size={17} color={colors.secondary} />
      <TextInput accessibilityLabel={`Buscar ${label.toLowerCase()} para filtrar`} placeholder="Buscar por nombre o código"
        value={query} onChangeText={text => { setQuery(text); setLimit(20); }} maxLength={120} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        onKeyPress={event => { if (event.nativeEvent.key === 'Escape') onClose(); }} style={styles.searchInput} />
    </View>
    {waitingForQuery ? <View style={styles.prompt}>
      <Text style={ui.subtitle}>Escribe el nombre o código para ver las opciones.</Text>
      {allowEmpty && Boolean(value) && <Pressable accessibilityRole="button" accessibilityLabel={`${clearLabel} de ${label.toLowerCase()}`} onPress={() => onSelect('')} style={styles.clear}>
        <Text style={ui.link}>{clearLabel}</Text>
      </Pressable>}
    </View> : searching ? <View style={styles.searching} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.primary} /><Text style={ui.subtitle}>Buscando opciones…</Text>
    </View> : <>
      <Text accessibilityLiveRegion="polite" style={styles.count}>{matches.length} opción{matches.length === 1 ? '' : 'es'}</Text>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.options}>
        <View accessibilityRole="radiogroup" accessibilityLabel={`Opciones de ${label.toLowerCase()}`}>
          {[...(allowEmpty ? [{ id: '', name: emptyLabel }] : []), ...matches.slice(0, limit)].map(option => <Pressable key={option.id}
            accessibilityRole="radio" accessibilityLabel={`${label}: ${option.name}${option.code ? ` (${option.code})` : ''}`}
            accessibilityState={{ checked: value === option.id }} aria-checked={value === option.id} onPress={() => onSelect(option.id)}
            style={[styles.option, value === option.id && styles.selected]}>
            <View style={styles.optionBody}><Text style={[styles.optionName, value === option.id && styles.selectedText]}>{option.name}</Text>
              {option.code && <Text style={ui.subtitle}>{option.code}</Text>}</View>
            {value === option.id && <Check size={18} color={colors.primary} />}
          </Pressable>)}
          {!matches.length && <Text style={styles.empty}>{options.length ? 'No hay coincidencias. Prueba otro nombre o código.' : 'Sin opciones disponibles.'}</Text>}
          {matches.length > limit && <Pressable accessibilityRole="button" accessibilityLabel={`Mostrar más opciones de ${label.toLowerCase()}`}
            onPress={() => setLimit(count => count + 20)} style={styles.more}><Text style={ui.link}>Mostrar más ({Math.min(limit, matches.length)} de {matches.length})</Text></Pressable>}
        </View>
      </ScrollView>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 8 }, trigger: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  open: { borderColor: colors.primary }, value: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, lineHeight: 21 }, placeholder: { color: colors.muted },
  menu: { borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.surface, overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, color: colors.ink, fontSize: 14 },
  options: { maxHeight: 220, flexGrow: 0 }, count: { color: colors.muted, fontSize: 12, paddingHorizontal: 14, paddingBottom: 8 },
  option: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  optionBody: { flex: 1, minWidth: 0, gap: 2 }, optionName: { color: colors.ink, fontSize: 14, lineHeight: 21 }, selected: { backgroundColor: colors.tint }, selectedText: { color: colors.primary, fontWeight: '600' },
  prompt: { paddingHorizontal: 14, paddingBottom: 14, gap: 4 }, clear: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  searching: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, empty: { color: colors.muted, fontSize: 13, lineHeight: 20, padding: 14 },
  more: { minHeight: 44, padding: 14, alignItems: 'center', justifyContent: 'center' },
});
