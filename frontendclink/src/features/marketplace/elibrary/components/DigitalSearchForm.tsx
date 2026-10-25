import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FilterChips, FilterSheet, SearchInput, ui } from '../../components/CatalogUI';
import { AcademicFilterFields } from '../../components/AcademicFilterFields';
import type { DigitalAcademicCatalog, DigitalFilters } from '../types/publication';
export const emptyDigitalFilters: DigitalFilters = { q: '', careerId: '', subjectId: '', modality: '' };

export function DigitalSearchForm({ catalog, filters, onSearch, catalogLoading, catalogError, reloadCatalog }: {
  catalog: DigitalAcademicCatalog | null; filters: DigitalFilters; onSearch: (filters: DigitalFilters) => void;
  catalogLoading: boolean; catalogError: string | null; reloadCatalog: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [openFilter, setOpenFilter] = useState<'careerId' | 'subjectId' | null>(null);
  const closeFilters = () => { setExpanded(false); setOpenFilter(null); };
  const active = (['careerId', 'subjectId'] as const).filter(key => filters[key]).map(key => ({ key,
    label: (key === 'careerId' ? catalog?.careers : catalog?.subjects)?.find(row => row.id === filters[key])?.name ?? (key === 'careerId' ? 'Carrera' : 'Asignatura'),
    remove: () => onSearch({ ...filters, [key]: '' }),
  }));
  return <View style={{ gap: 12 }}>
    <SearchInput value={filters.q} onChange={q => onSearch({ ...filters, q })} placeholder="Buscar apuntes, guías, resúmenes…" />
    <FilterChips modality={filters.modality} onModality={modality => onSearch({ ...filters, modality })} onMore={() => { setOpenFilter(null); setExpanded(true); }} active={active} />
    <FilterSheet fillHeight compact preferredHeight={480} visible={expanded} title="Filtros de Biblioteca" onClose={closeFilters}>
      {catalogLoading && <Text style={ui.subtitle}>Cargando carreras y asignaturas…</Text>}
      {catalogError && <><Text accessibilityRole="alert" style={{ color: '#AD3029' }}>{catalogError}</Text><Pressable accessibilityRole="button" onPress={reloadCatalog} style={ui.outlined}><Text style={ui.link}>Reintentar</Text></Pressable></>}
      <AcademicFilterFields careers={catalog?.careers ?? []} subjects={catalog?.subjects ?? []}
        careerId={filters.careerId} subjectId={filters.subjectId} onChange={(field, id) => onSearch({ ...filters, [field]: id })}
        openField={openFilter} onOpenFieldChange={setOpenFilter} disabled={catalogLoading || Boolean(catalogError) || !catalog} loading={catalogLoading} />
    </FilterSheet>
  </View>;
}
