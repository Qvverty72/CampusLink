import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { resourceConditions, type PhysicalgoodsSearchFilters } from '../types/publication';

/** Vincula los filtros con la búsqueda y validación del hook de recursos. */
export function PhysicalgoodsSearchFilters({ resources: r }: { resources: ReturnType<typeof usePhysicalgoodsResources> }) {
  const [expanded, setExpanded] = useState(false);
  const choices = (key: Exclude<keyof PhysicalgoodsSearchFilters, 'mine'>, label: string, options: { value: string; name: string }[]) => <>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.choices}>{options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${label}: ${option.name}`}
      accessibilityState={{ checked: r.filters[key] === option.value }} onPress={() => r.setFilter(key, option.value)}
      style={[styles.choice, r.filters[key] === option.value && styles.selected]}><Text style={styles.action}>{option.name}</Text></Pressable>)}</View>
  </>;
  return <View style={styles.form}>
    <Text style={styles.label}>Buscar por nombre o descripción</Text>
    <TextInput accessibilityLabel="Buscar recursos por nombre o descripción" value={r.filters.q} onChangeText={value => r.setFilter('q', value)}
      maxLength={200} placeholder="Ej. libro cálculo" returnKeyType="search" onSubmitEditing={r.search} style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}><Text style={styles.action}>{expanded ? 'Ocultar filtros' : 'Mostrar filtros'}</Text></Pressable>
    {expanded && <>
      {choices('categoryId', 'Filtro de categoría', [{ value: '', name: 'Todas las categorías' }, ...(r.options?.categories ?? []).map(row => ({ value: row.id, name: row.name }))])}
      {choices('modality', 'Modalidad', [{ value: '', name: 'Todas' }, { value: 'VENTA', name: 'Venta' }, { value: 'DONACION', name: 'Donación' }])}
      {choices('condition', 'Condición', [{ value: '', name: 'Cualquiera' }, ...resourceConditions.map(row => ({ value: row.value, name: row.label }))])}
      {Boolean(r.options?.careers.length) && choices('careerId', 'Carrera', [{ value: '', name: 'Cualquiera' }, ...r.options!.careers.map(row => ({ value: row.id, name: row.name }))])}
      {Boolean(r.options?.subjects.length) && choices('subjectId', 'Asignatura', [{ value: '', name: 'Cualquiera' }, ...r.options!.subjects.map(row => ({ value: row.id, name: row.name }))])}
      {r.filters.modality !== 'DONACION' && <>
        <Text style={styles.label}>Precio de venta (CLP)</Text>
        <Text style={styles.hint}>Un rango de precio muestra solo ventas.</Text>
        <TextInput accessibilityLabel="Precio mínimo" placeholder="Mínimo" value={r.filters.minPrice} onChangeText={value => r.setFilter('minPrice', value)} inputMode="decimal" style={styles.input} />
        <TextInput accessibilityLabel="Precio máximo" placeholder="Máximo" value={r.filters.maxPrice} onChangeText={value => r.setFilter('maxPrice', value)} inputMode="decimal" style={styles.input} />
      </>}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Solo mis publicaciones disponibles" accessibilityState={{ checked: r.filters.mine }} onPress={() => r.setFilter('mine', !r.filters.mine)}><Text style={styles.action}>{r.filters.mine ? '☑' : '☐'} Solo mis publicaciones disponibles</Text></Pressable>
    </>}
    <View style={styles.choices}>
      <Pressable accessibilityRole="button" onPress={r.search} style={styles.button}><Text style={styles.buttonText}>Buscar recursos</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={r.clearFilters} style={styles.choice}><Text style={styles.action}>Limpiar filtros</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  form: { gap: 12 }, label: { color: '#09243A', fontSize: 16, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#C8D7E0', borderRadius: 10, padding: 14, fontSize: 16, color: '#09243A' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#C8D7E0' },
  selected: { borderColor: '#0B6E75', backgroundColor: '#E3F2F0' }, action: { color: '#0B6E75', fontSize: 15, paddingVertical: 6 },
  button: { backgroundColor: '#0B6E75', borderRadius: 10, padding: 16, justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  hint: { color: '#607485', fontSize: 13 },
});
