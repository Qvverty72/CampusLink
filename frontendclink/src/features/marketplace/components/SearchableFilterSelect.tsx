import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Search, X } from 'lucide-react-native';
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
  optionsLoading?: boolean;
  searchRequired?: boolean;
  searchable?: boolean;
  showLabel?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  clearLabel?: string;
};

/** Busca en el catálogo ya cargado; escribir nunca modifica el filtro ni llama a la API. */
export function SearchableFilterSelect({ label, options, value, onChange, expanded, onExpandedChange, disabled = false, loading = false, optionsLoading = false, searchRequired = false, searchable = true, showLabel = true, placeholder = 'Cualquiera', allowEmpty = true, emptyLabel = 'Cualquiera', clearLabel = 'Quitar filtro' }: Props) {
  if (searchRequired) return <InlineAcademicSelect label={label} options={options} value={value} onChange={onChange}
    expanded={expanded} onExpandedChange={onExpandedChange} disabled={disabled} loading={loading}
    showLabel={showLabel} placeholder={placeholder} allowEmpty={allowEmpty} clearLabel={clearLabel} optionsLoading={optionsLoading} />;
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
    {open && <FilterSelectMenu searchable={searchable} searchRequired={searchRequired} allowEmpty={allowEmpty} emptyLabel={emptyLabel} clearLabel={clearLabel} label={label} options={options} value={value} onClose={() => onExpandedChange(false)} onSelect={id => {
      if (id !== value) onChange(id);
      onExpandedChange(false);
      Keyboard.dismiss();
    }} />}
  </View>;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();

/** El campo académico es el propio buscador; no hay un segundo input desplegable. */
function InlineAcademicSelect({ label, options, value, onChange, expanded, onExpandedChange, disabled, loading,
  showLabel, placeholder, allowEmpty, clearLabel, optionsLoading }: Props) {
  const [query, setQuery] = useState('');
  const [blurred, setBlurred] = useState(false);
  const unavailable = Boolean(disabled || loading), open = expanded && !unavailable;
  const selected = options.find(option => option.id === value);
  // Da tiempo al toque sobre una sugerencia antes de retirar la lista en web/nativo.
  useEffect(() => {
    if (!open || !blurred) return;
    const timer = setTimeout(() => onExpandedChange(false), 150);
    return () => clearTimeout(timer);
  }, [open, blurred, onExpandedChange]);
  const select = (id: string) => {
    if (id !== value) onChange(id);
    setQuery(''); setBlurred(false); onExpandedChange(false); Keyboard.dismiss();
  };
  return <View style={styles.group} onAccessibilityEscape={() => { onExpandedChange(false); Keyboard.dismiss(); }}>
    {showLabel && <Text style={ui.label}>{label}</Text>}
    <View style={[styles.trigger, open && styles.open, unavailable && ui.disabled]}>
      <Search size={17} color={colors.secondary} />
      <TextInput accessibilityLabel={`Buscar ${label.toLowerCase()} para filtrar`} accessibilityHint="Escribe un nombre o código y selecciona una coincidencia"
        accessibilityState={{ disabled: unavailable }} aria-expanded={open} editable={!unavailable}
        placeholder={loading ? 'Cargando opciones…' : placeholder} placeholderTextColor={colors.muted}
        value={open ? query : selected?.name ?? (value ? 'Selección no disponible' : '')}
        onFocus={() => { setQuery(''); setBlurred(false); onExpandedChange(true); }} onBlur={() => setBlurred(true)}
        onChangeText={text => { setQuery(text); setBlurred(false); if (!open) onExpandedChange(true); }}
        onKeyPress={event => { if (event.nativeEvent.key === 'Escape') { onExpandedChange(false); Keyboard.dismiss(); } }}
        maxLength={120} autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={styles.inlineInput} />
      {loading ? <ActivityIndicator size="small" color={colors.secondary} /> : allowEmpty && Boolean(value) &&
        <Pressable accessibilityRole="button" accessibilityLabel={`${clearLabel} de ${label.toLowerCase()}`} disabled={unavailable}
          onPress={() => select('')} style={styles.clearIcon}><X size={18} color={colors.secondary} /></Pressable>}
    </View>
    {open && <FilterSelectMenu label={label} options={options} value={value} onSelect={select}
      onClose={() => onExpandedChange(false)} searchRequired allowEmpty={false} emptyLabel="" clearLabel={clearLabel ?? 'Quitar filtro'} inlineQuery={query} optionsLoading={optionsLoading} />}
  </View>;
}

/** Al cerrar se desmonta: limpia búsqueda y temporizador de debounce. */
function FilterSelectMenu({ label, options, value, onSelect, onClose, searchRequired, allowEmpty, emptyLabel, clearLabel, inlineQuery, optionsLoading = false, searchable = true }: {
  searchable?: boolean;
  optionsLoading?: boolean;
  inlineQuery?: string;
  allowEmpty: boolean; emptyLabel: string; clearLabel: string;
  searchRequired: boolean; label: string; options: readonly FilterSelectOption[]; value: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [localQuery, setQuery] = useState('');
  const query = inlineQuery ?? localQuery;
  const debouncedQuery = useDebouncedValue(query);
  const waitingForQuery = searchRequired && !normalize(query);
  const searching = !waitingForQuery && query !== debouncedQuery;
  const matches = useMemo(() => {
    const needle = normalize(debouncedQuery);
    if (searchRequired && !needle) return [];
    const matching = options.filter(option => normalize(`${option.name} ${option.code ?? ''}`).includes(needle));
    if (!searchable) return matching;
    const selected = matching.find(option => option.id === value);
    return selected ? [selected, ...matching.filter(option => option.id !== value)] : matching;
  }, [options, value, debouncedQuery, searchRequired, searchable]);
  if (inlineQuery !== undefined && waitingForQuery) return null;
  return <View style={[styles.menu, !searchable && styles.plainMenu, inlineQuery !== undefined && styles.inlineMenu]}>
    {searchable && inlineQuery === undefined && <View style={styles.search}>
      <Search size={17} color={colors.secondary} />
      <TextInput accessibilityLabel={`Buscar ${label.toLowerCase()} para filtrar`} placeholder="Buscar por nombre o código"
        value={query} onChangeText={setQuery} maxLength={120} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        onKeyPress={event => { if (event.nativeEvent.key === 'Escape') onClose(); }} style={styles.searchInput} />
    </View>}
    {waitingForQuery ? <View style={styles.prompt}>
      <Text style={ui.subtitle}>Escribe el nombre o código para ver las opciones.</Text>
      {allowEmpty && Boolean(value) && <Pressable accessibilityRole="button" accessibilityLabel={`${clearLabel} de ${label.toLowerCase()}`} onPress={() => onSelect('')} style={styles.clear}>
        <Text style={ui.link}>{clearLabel}</Text>
      </Pressable>}
    </View> : searching || optionsLoading ? <View style={styles.searching} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.primary} /><Text style={ui.subtitle}>Buscando opciones…</Text>
    </View> : <>
      <Text accessibilityLiveRegion="polite" style={styles.count}>{matches.length} opción{matches.length === 1 ? '' : 'es'}</Text>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.options}>
        <View accessibilityRole="radiogroup" accessibilityLabel={`Opciones de ${label.toLowerCase()}`}>
          {[...(allowEmpty ? [{ id: '', name: emptyLabel }] : []), ...matches].map(option => <Pressable key={option.id}
            accessibilityRole="radio" accessibilityLabel={`${label}: ${option.name}${option.code ? ` (${option.code})` : ''}`}
            accessibilityState={{ checked: value === option.id }} aria-checked={value === option.id} onPress={() => onSelect(option.id)}
            style={[styles.option, value === option.id && styles.selected]}>
            <View style={styles.optionBody}><Text style={[styles.optionName, value === option.id && styles.selectedText]}>{option.name}</Text>
              {option.code && <Text style={ui.subtitle}>{option.code}</Text>}</View>
            {value === option.id && <Check size={18} color={colors.primary} />}
          </Pressable>)}
          {!matches.length && <Text style={styles.empty}>{options.length ? 'No hay coincidencias. Prueba otro nombre o código.' : 'Sin opciones disponibles.'}</Text>}
        </View>
      </ScrollView>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 8 }, trigger: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10 },
  open: { borderColor: colors.primary }, value: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, lineHeight: 21 }, placeholder: { color: colors.muted },
  inlineInput: { flex: 1, minWidth: 0, minHeight: 24, padding: 0, color: colors.ink, fontSize: 14, lineHeight: 21 },
  clearIcon: { minWidth: 44, minHeight: 44, marginVertical: -10, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  inlineMenu: { borderWidth: 0, borderRadius: 10, backgroundColor: colors.tint, paddingTop: 8 },
  menu: { borderRadius: 12, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.surface, overflow: 'hidden' },
  plainMenu: { paddingTop: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, color: colors.ink, fontSize: 14 },
  options: { maxHeight: 220, flexGrow: 0 }, count: { color: colors.muted, fontSize: 12, paddingHorizontal: 14, paddingBottom: 8 },
  option: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  optionBody: { flex: 1, minWidth: 0, gap: 2 }, optionName: { color: colors.ink, fontSize: 14, lineHeight: 21 }, selected: { backgroundColor: colors.tint }, selectedText: { color: colors.primary, fontWeight: '600' },
  prompt: { paddingHorizontal: 14, paddingBottom: 14, gap: 4 }, clear: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  searching: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, empty: { color: colors.muted, fontSize: 13, lineHeight: 20, padding: 14 },
});
