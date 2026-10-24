import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { resourceConditions } from '../types/publication';
import { FilterChips, FilterOptions, FilterSheet, SearchInput, ui } from '../../components/CatalogUI';

export function PhysicalgoodsSearchFilters({ resources: r }: { resources: ReturnType<typeof usePhysicalgoodsResources> }) {
  const [expanded, setExpanded] = useState(false);
  const groups = [
    { key: 'categoryId', label: 'Categoría', options: r.options?.categories ?? [] },
    { key: 'condition', label: 'Condición', options: resourceConditions.map(row => ({ id: row.value, name: row.label })) },
    { key: 'careerId', label: 'Carrera', options: r.options?.careers ?? [] },
    { key: 'subjectId', label: 'Asignatura', options: r.options?.subjects ?? [] },
  ] as const;
  const active: { key: string; label: string; remove: () => void }[] = groups.filter(group => r.filters[group.key]).map(group => ({ key: group.key,
    label: group.options.find(row => row.id === r.filters[group.key])?.name ?? group.label, remove: () => r.setFilter(group.key, '') }));
  for (const key of ['minPrice', 'maxPrice'] as const) if (r.filters[key]) active.push({ key,
    label: `${key === 'minPrice' ? 'Desde' : 'Hasta'} $${r.filters[key]}`, remove: () => r.setFilter(key, '') });
  if (r.filters.mine) active.push({ key: 'mine', label: 'Mis publicaciones', remove: () => r.setFilter('mine', false) });
  return <View style={{ gap: 12 }}>
    <SearchInput label="Buscar recursos por nombre o descripción" value={r.filters.q} onChange={value => r.setFilter('q', value)} placeholder="Buscar libro, calculadora, apuntes…" />
    <FilterChips modality={r.filters.modality} onModality={value => r.setFilter('modality', value)} onMore={() => setExpanded(true)} active={active} />
    <FilterSheet visible={expanded} title="Filtros de Mercado" onClose={() => setExpanded(false)}>
      {groups.map(group => <FilterOptions key={group.key} label={group.label} options={[...group.options]} value={r.filters[group.key]} onChange={value => r.setFilter(group.key, value)} />)}
      {r.filters.modality !== 'DONACION' && <View style={{ gap: 8 }}><Text style={ui.label}>Precio de venta (CLP)</Text><Text style={ui.subtitle}>Un rango de precio muestra solo ventas.</Text>
        {(['minPrice', 'maxPrice'] as const).map(key => <TextInput key={key} accessibilityLabel={key === 'minPrice' ? 'Precio mínimo' : 'Precio máximo'} placeholder={key === 'minPrice' ? 'Mínimo' : 'Máximo'}
          value={r.filters[key]} onChangeText={value => r.setFilter(key, value)} inputMode="decimal" style={ui.input} />)}
      </View>}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Solo mis publicaciones disponibles" accessibilityState={{ checked: r.filters.mine }}
        onPress={() => r.setFilter('mine', !r.filters.mine)} style={ui.option}><Text style={ui.link}>{r.filters.mine ? '☑' : '☐'} Solo mis publicaciones disponibles</Text></Pressable>
      {r.error && <Text accessibilityRole="alert" style={{ color: '#AD3029' }}>{r.error}</Text>}
      {!r.options && <Pressable accessibilityRole="button" onPress={r.reload} style={ui.outlined}><Text style={ui.link}>Reintentar carga de filtros</Text></Pressable>}
    </FilterSheet>
  </View>;
}
