import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FilterChips, FilterOptions, FilterSheet, SearchInput, ui } from '../../components/CatalogUI';
import type { DigitalAcademicCatalog, DigitalFilters } from '../types/publication';
export const emptyDigitalFilters: DigitalFilters = { q: '', careerId: '', subjectId: '', modality: '' };

export function DigitalSearchForm({ catalog, filters, onSearch, catalogLoading, catalogError, reloadCatalog }: {
  catalog: DigitalAcademicCatalog | null; filters: DigitalFilters; onSearch: (filters: DigitalFilters) => void;
  catalogLoading: boolean; catalogError: string | null; reloadCatalog: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = (['careerId', 'subjectId'] as const).filter(key => filters[key]).map(key => ({ key,
    label: (key === 'careerId' ? catalog?.careers : catalog?.subjects)?.find(row => row.id === filters[key])?.name ?? (key === 'careerId' ? 'Carrera' : 'Asignatura'),
    remove: () => onSearch({ ...filters, [key]: '' }),
  }));
  return <View style={{ gap: 12 }}>
    <SearchInput value={filters.q} onChange={q => onSearch({ ...filters, q })} placeholder="Buscar apuntes, guías, resúmenes…" />
    <FilterChips modality={filters.modality} onModality={modality => onSearch({ ...filters, modality })} moreLabel="Carrera" onMore={() => setExpanded(true)} active={active} />
    <FilterSheet visible={expanded} title="Filtros de Biblioteca" onClose={() => setExpanded(false)}>
      {catalogLoading && <Text style={ui.subtitle}>Cargando carreras y asignaturas…</Text>}
      {catalogError && <><Text accessibilityRole="alert" style={{ color: '#AD3029' }}>{catalogError}</Text><Pressable accessibilityRole="button" onPress={reloadCatalog} style={ui.outlined}><Text style={ui.link}>Reintentar</Text></Pressable></>}
      <FilterOptions label="Carrera" options={catalog?.careers ?? []} value={filters.careerId} onChange={careerId => onSearch({ ...filters, careerId })} />
      <FilterOptions label="Asignatura" options={catalog?.subjects ?? []} value={filters.subjectId} onChange={subjectId => onSearch({ ...filters, subjectId })} />
    </FilterSheet>
  </View>;
}
