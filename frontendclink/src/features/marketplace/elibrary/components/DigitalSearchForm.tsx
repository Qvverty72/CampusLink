import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import type { DigitalAcademicCatalog, DigitalAcademicOption, DigitalFilters } from '../types/publication';
export const emptyDigitalFilters: DigitalFilters = { q: '', careerId: '', subjectId: '', modality: '' };
export function DigitalSearchForm({ catalog, onSearch, loading }: { catalog: DigitalAcademicCatalog | null; onSearch: (filters: DigitalFilters) => void; loading: boolean }) {
  const [draft, setDraft] = useState<DigitalFilters>(emptyDigitalFilters), [expanded, setExpanded] = useState(false);
  return <View style={styles.box}>
    <TextInput accessibilityLabel="Buscar recursos" placeholder="Nombre o descripción" value={draft.q} maxLength={200}
      onChangeText={q => setDraft(previous => ({ ...previous, q }))} onSubmitEditing={() => onSearch(draft)} style={styles.input} />
    <Pressable accessibilityRole="button" onPress={() => setExpanded(value => !value)} style={styles.button}><Text style={styles.link}>{expanded ? 'Ocultar filtros' : 'Carrera, asignatura y modalidad'}</Text></Pressable>
    {expanded && <>
      <Text style={styles.label}>Modalidad</Text>
      <View style={styles.row}>{(['','VENTA','DONACION'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
        aria-checked={draft.modality === value} accessibilityState={{ checked: draft.modality === value }} onPress={() => setDraft(previous => ({ ...previous, modality: value }))}
        style={[styles.option, draft.modality === value && styles.selected]}><Text style={styles.link}>{value === 'VENTA' ? 'Venta' : value === 'DONACION' ? 'Donación' : 'Todas'}</Text></Pressable>)}</View>
      {(['careerId','subjectId'] as const).map(field => <View key={field} style={styles.group}>
        <Text style={styles.label}>{field === 'careerId' ? 'Carrera' : 'Asignatura'}</Text>
        <AcademicFilter label={field === 'careerId' ? 'carrera' : 'asignatura'} options={field === 'careerId' ? catalog?.careers ?? [] : catalog?.subjects ?? []}
          selected={draft[field]} onChange={id => setDraft(previous => ({ ...previous, [field]: id }))} />
        {!catalog && <Text style={styles.helper}>El catálogo académico todavía no está disponible.</Text>}
      </View>)}
    </>}
    <View style={styles.row}><Pressable accessibilityRole="button" disabled={loading} onPress={() => onSearch(draft)} style={styles.button}><Text style={styles.link}>Buscar</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => { setDraft(emptyDigitalFilters); onSearch(emptyDigitalFilters); }} style={styles.button}><Text style={styles.link}>Limpiar filtros</Text></Pressable></View>
  </View>;
}
function AcademicFilter({ label, options, selected, onChange }: { label: string; options: DigitalAcademicOption[]; selected: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState(''), [limit, setLimit] = useState(20);
  const needle = search.trim().toLocaleLowerCase();
  const matches = options.filter(option => option.id !== selected && `${option.name} ${option.code ?? ''}`.toLocaleLowerCase().includes(needle));
  const visible = [{ id: '', name: 'Todas', code: null }, ...options.filter(option => option.id === selected), ...matches.slice(0, limit)];
  return <View style={styles.group}>
    {options.length > 8 && <TextInput accessibilityLabel={`Buscar ${label} para filtrar`} placeholder="Nombre o código"
      value={search} onChangeText={value => { setSearch(value); setLimit(20); }} style={styles.input} />}
    <View style={styles.row}>{visible.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`Filtrar ${label}: ${option.name}`}
      aria-checked={selected === option.id} accessibilityState={{ checked: selected === option.id }}
      onPress={() => onChange(option.id)} style={[styles.option, selected === option.id && styles.selected]}>
      <Text style={styles.link}>{option.name}{option.code ? ` (${option.code})` : ''}</Text>
    </Pressable>)}</View>
    {matches.length > limit && <Pressable accessibilityRole="button" accessibilityLabel={`Mostrar más opciones de ${label}`}
      onPress={() => setLimit(value => value + 20)} style={styles.button}><Text style={styles.link}>Mostrar más ({Math.min(limit, matches.length)} de {matches.length})</Text></Pressable>}
    {options.length > 0 && !matches.length && !options.some(option => option.id === selected) && <Text style={styles.helper}>No hay coincidencias.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  box: { gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E8ED', padding: 16, borderRadius: 16 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#BDCBD5', borderRadius: 12, padding: 12, fontSize: 16, color: '#09243A' },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: APP_COLORS.PRIMARY, fontSize: 15, flexShrink: 1 }, label: { color: '#09243A', fontWeight: '600', fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, group: { gap: 8 },
  option: { padding: 12, minHeight: 44, borderWidth: 1, borderColor: '#BDCBD5', borderRadius: 12, maxWidth: '100%' },
  selected: { backgroundColor: '#E9F0F6', borderColor: APP_COLORS.PRIMARY }, helper: { color: '#607485', fontSize: 14 },
});
