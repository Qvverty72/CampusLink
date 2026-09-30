import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { catalog, filterCatalog, moduleNames, type ContentKind } from '@/mocks/catalog';
import { ActivityCard, ResourceCard } from '@/components/ContentCard';
import { BottomSheet, Button, Chip, EmptyState, LoadingState, Screen, SearchBar, go, ui } from '@/components/ui';

export function ExploreScreen({ kind }: { kind: ContentKind }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setLoading(false), 450); return () => clearTimeout(timer); }, []);
  const categories = ['Todas', ...new Set(catalog.filter((item) => item.kind === kind).map((item) => item.category))];
  const items = filterCatalog(kind, query, category);
  return <Screen title={moduleNames[kind]} canGoBack={kind === 'activities'}>
    <Text style={ui.muted}>Contenido de demostración · Comparte y descubre en tu comunidad.</Text>
    {kind === 'activities' && <Button label="Crear actividad" onPress={() => go('/create/activity')} />}
    <SearchBar value={query} onChangeText={setQuery} />
    <View style={ui.row}><Button secondary label={`Filtros · ${category}`} onPress={() => setFiltersOpen(true)} /><Text style={ui.muted}>{items.length} resultados</Text></View>
    {loading ? <LoadingState /> : items.length ? items.map((item) => item.kind === 'activities' ? <ActivityCard key={item.id} item={item} /> : <ResourceCard key={item.id} item={item} />) : <><EmptyState /><Button secondary label="Limpiar búsqueda y filtros" onPress={() => { setQuery(''); setCategory('Todas'); }} /></>}
    <BottomSheet visible={filtersOpen} title="Filtrar por categoría" onClose={() => setFiltersOpen(false)}>
      <Text style={ui.muted}>Filtros locales sobre datos ficticios.</Text>
      {categories.map((label) => <Chip key={label} label={label} selected={category === label} onPress={() => { setCategory(label); setFiltersOpen(false); }} />)}
    </BottomSheet>
  </Screen>;
}
