import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AcademicFilterFields } from '../../components/AcademicFilterFields';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { resourceConditions } from '../types/publication';
import { FilterChips, FilterSheet, SearchInput, CATALOG_COLORS as colors, ui } from '../../components/CatalogUI';
import { orderPhysicalgoodsCategories } from '../utils/orderPhysicalgoodsCategories';

export function PhysicalgoodsSearchFilters({ resources: r }: { resources: ReturnType<typeof usePhysicalgoodsResources> }) {
  const [expanded, setExpanded] = useState(false);
  const [openFilter, setOpenFilter] = useState<'careerId' | 'subjectId' | null>(null);
  const closeFilters = () => { setExpanded(false); setOpenFilter(null); };
  const categories = orderPhysicalgoodsCategories(r.options?.categories ?? []);
  const groups = [
    { key: 'categoryId', label: 'Categoría', options: categories },
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
    <FilterChips modality={r.filters.modality} onModality={value => r.setFilter('modality', value)} onMore={() => { setOpenFilter(null); setExpanded(true); }} active={active} />
    <FilterSheet fillHeight compact preferredHeight={680} visible={expanded} title="Filtros de Mercado" onClose={closeFilters}>
      <View style={styles.group}>
        <Text style={ui.filterLabel}>Categoría</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Categoría" style={styles.categories}>
            {[{ id: '', name: 'Todas' }, ...categories].map(option => <Pressable key={option.id}
              accessibilityRole="radio" accessibilityLabel={`Categoría: ${option.name}`} accessibilityState={{ checked: r.filters.categoryId === option.id, disabled: !r.options }}
              disabled={!r.options} onPress={() => { if (r.filters.categoryId !== option.id) r.setFilter('categoryId', option.id); }}
              style={[styles.category, r.filters.categoryId === option.id && styles.activeCategory, !r.options && ui.disabled]}>
              <Text style={[styles.choiceText, r.filters.categoryId === option.id && styles.activeCategoryText]}>{option.name}</Text>
            </Pressable>)}
          </View>
        </ScrollView>
      </View>
      <View style={styles.group}>
        <Text style={ui.filterLabel}>Condición</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.conditionScroll}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Condición" style={styles.segments}>
            {[{ value: '', label: 'Todas' }, ...resourceConditions].map(option => <Pressable key={option.value}
              accessibilityRole="radio" accessibilityLabel={`Condición: ${option.label}`} accessibilityState={{ checked: r.filters.condition === option.value }}
              onPress={() => { if (r.filters.condition !== option.value) r.setFilter('condition', option.value); }}
              style={[styles.segment, r.filters.condition === option.value && styles.activeSegment]}>
              <Text style={[styles.choiceText, styles.conditionText]}>{option.label}</Text>
            </Pressable>)}
          </View>
        </ScrollView>
      </View>
      <AcademicFilterFields careers={r.options?.careers ?? []} subjects={r.options?.subjects ?? []}
        careerId={r.filters.careerId} subjectId={r.filters.subjectId} onChange={(field, id) => r.setFilter(field, id)}
        openField={openFilter} onOpenFieldChange={setOpenFilter} disabled={!r.options} loading={!r.options && !r.error} />
      {r.filters.modality !== 'DONACION' && <View style={styles.group}>
        <Text style={ui.filterLabel}>Precio de venta (CLP)</Text>
        <View style={styles.prices}>
          {(['minPrice', 'maxPrice'] as const).map(key => <TextInput key={key} accessibilityLabel={key === 'minPrice' ? 'Precio mínimo' : 'Precio máximo'}
            placeholder={key === 'minPrice' ? 'Mínimo' : 'Máximo'} placeholderTextColor={colors.muted}
            value={r.filters[key]} onChangeText={value => r.setFilter(key, value)} inputMode="decimal" style={[ui.input, styles.priceInput]} />)}
        </View>
        <Text style={styles.hint}>Un rango de precio muestra solo ventas.</Text>
      </View>}
      {r.error && <Text accessibilityRole="alert" style={{ color: '#AD3029' }}>{r.error}</Text>}
      {!r.options && <Pressable accessibilityRole="button" onPress={r.reload} style={ui.outlined}><Text style={ui.link}>Reintentar carga de filtros</Text></Pressable>}
    </FilterSheet>
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 8 }, categories: { flexDirection: 'row', gap: 8 },
  category: { minHeight: 44, borderRadius: 24, backgroundColor: colors.tint, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  activeCategory: { backgroundColor: colors.primary }, activeCategoryText: { color: colors.surface },
  choiceText: { color: colors.primary, fontSize: 12, textAlign: 'center' },
  conditionScroll: { flexGrow: 1 }, segments: { flexDirection: 'row', flexGrow: 1, backgroundColor: colors.tint, borderRadius: 26, padding: 3 },
  conditionText: { fontSize: 11 },
  segment: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center', flexGrow: 1, borderRadius: 24, borderWidth: 1, borderColor: 'transparent' },
  activeSegment: { backgroundColor: colors.surface, borderColor: colors.border },
  prices: { flexDirection: 'row', gap: 8 }, priceInput: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 10 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
