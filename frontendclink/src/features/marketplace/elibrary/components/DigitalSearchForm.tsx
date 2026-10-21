import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';
import type { DigitalAcademicCatalog, DigitalFilters } from '../types/publication';
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
        <View style={styles.row}>{[{ id: '', name: 'Todas', code: null }, ...(field === 'careerId' ? catalog?.careers ?? [] : catalog?.subjects ?? [])].map(option =>
          <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`Filtrar ${field === 'careerId' ? 'carrera' : 'asignatura'}: ${option.name}`}
            aria-checked={draft[field] === option.id} accessibilityState={{ checked: draft[field] === option.id }}
            onPress={() => setDraft(previous => ({ ...previous, [field]: option.id }))} style={[styles.option, draft[field] === option.id && styles.selected]}>
            <Text style={styles.link}>{option.name}{option.code ? ` (${option.code})` : ''}</Text>
          </Pressable>)}</View>
        {!catalog && <Text style={styles.helper}>El catálogo académico todavía no está disponible.</Text>}
      </View>)}
    </>}
    <View style={styles.row}><Pressable accessibilityRole="button" disabled={loading} onPress={() => onSearch(draft)} style={styles.button}><Text style={styles.link}>Buscar</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => { setDraft(emptyDigitalFilters); onSearch(emptyDigitalFilters); }} style={styles.button}><Text style={styles.link}>Limpiar filtros</Text></Pressable></View>
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
