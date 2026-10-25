import { safeAreaInset } from '@/lib/layout/safeArea';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_COLORS } from '@/types/colors';

/** Colores de superficies existentes y paleta institucional, compartidos por ambos catálogos. */
export const CATALOG_COLORS = {
  background: '#F4F7F9', surface: '#FFFFFF', ink: '#09243A', muted: '#607485',
  border: '#E0E8ED', inputBorder: '#BDCBD5', tint: '#E9F0F6',
  primary: APP_COLORS.PRIMARY, secondary: APP_COLORS.SECONDARY,
};

export function ScreenHeader({ title, subtitle, action, onAction, onBack, actionBadgeCount }: {
  title: string; subtitle: string; action?: string; onAction?: () => void; onBack?: () => void; actionBadgeCount?:number;
}) {
  const count=typeof actionBadgeCount==='number'&&Number.isFinite(actionBadgeCount)&&actionBadgeCount>0?actionBadgeCount:0;
  return <View style={ui.header}>
    {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Volver al catálogo" onPress={onBack} style={ui.back}>
      <ArrowLeft size={18} color={CATALOG_COLORS.primary} /><Text style={ui.link}>Volver</Text>
    </Pressable>}
    <View style={ui.headingRow}><Text accessibilityRole="header" style={ui.title}>{title}</Text>
      {action && <Pressable accessibilityRole="button" accessibilityLabel={count?`${action}, ${count} ${count===1?'pendiente':'pendientes'} en Solicitudes y Transacciones`:action} onPress={onAction} style={[ui.outlined,ui.headerAction]}><Text style={ui.actionText}>{action}</Text>
        {count>0&&<View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={ui.tabBadge}><Text style={ui.tabBadgeText}>{count>99?'99+':count}</Text></View>}
      </Pressable>}
    </View>
    <Text style={ui.subtitle}>{subtitle}</Text>
  </View>;
}

export function SearchInput({ value, onChange, placeholder, label = 'Buscar recursos' }: {
  value: string; onChange: (value: string) => void; placeholder: string; label?: string;
}) {
  return <View style={ui.search}><Search size={19} color={CATALOG_COLORS.secondary} />
    <TextInput accessibilityLabel={label} placeholder={placeholder} placeholderTextColor={CATALOG_COLORS.muted}
      value={value} onChangeText={onChange} maxLength={200} returnKeyType="search" style={ui.searchInput} />
    {Boolean(value) && <Pressable accessibilityRole="button" accessibilityLabel="Quitar búsqueda" onPress={() => onChange('')} style={ui.iconButton}>
      <X size={18} color={CATALOG_COLORS.primary} />
    </Pressable>}
  </View>;
}

export function FilterChips({ modality, onModality, onMore, moreLabel = 'Filtros', active = [] }: {
  modality: string; onModality: (value: '' | 'VENTA' | 'DONACION') => void; onMore: () => void;
  moreLabel?: string; active?: { key: string; label: string; remove: () => void }[];
}) {
  return <View style={ui.filterGroup}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.chipRow}>
      {(['', 'VENTA', 'DONACION'] as const).map(value => <Pressable key={value} accessibilityRole="radio"
        accessibilityLabel={`Modalidad: ${value === 'VENTA' ? 'Venta' : value === 'DONACION' ? 'Donación' : 'Todo'}`}
        accessibilityState={{ checked: modality === value }} aria-checked={modality === value} onPress={() => onModality(value)}
        style={[ui.chip, modality === value && ui.activeChip]}>
        <Text style={[ui.chipText, modality === value && ui.activeChipText]}>{value === 'VENTA' ? 'Venta' : value === 'DONACION' ? 'Donación' : 'Todo'}</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${moreLabel.toLowerCase()}`} onPress={onMore} style={ui.chip}>
        {moreLabel === 'Filtros' && <SlidersHorizontal size={15} color={CATALOG_COLORS.primary} />}
        <Text style={ui.chipText}>{moreLabel}{active.length ? ` (${active.length})` : ''}</Text>
        {moreLabel !== 'Filtros' && <ChevronDown size={15} color={CATALOG_COLORS.primary} />}
      </Pressable>
    </ScrollView>
    {active.length > 0 && <View style={ui.activeFilters}>{active.map(item => <Pressable key={item.key} accessibilityRole="button"
      accessibilityLabel={`Quitar filtro ${item.label}`} onPress={item.remove} style={ui.removableChip}>
      <Text style={ui.removableText}>{item.label}</Text><X size={14} color={CATALOG_COLORS.primary} />
    </Pressable>)}</View>}
  </View>;
}

export function FilterSheet({ visible, title, onClose, children, confirmLabel = 'Ver resultados', fillHeight = false, compact = false, preferredHeight }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; confirmLabel?: string | null; fillHeight?: boolean; compact?: boolean; preferredHeight?: number }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={ui.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[ui.sheet, fillHeight && ui.fullSheet, fillHeight && preferredHeight !== undefined && { height: preferredHeight }, compact && ui.compactSheet, { paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 20 }), marginTop: safeAreaInset('top', insets.top, { min: 24 }) }]}>
        {!compact && <View style={ui.handle} />}
        <View style={ui.headingRow}><Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={onClose} style={ui.iconButton}><X color={CATALOG_COLORS.primary} size={22} /></Pressable>
        </View>
        <ScrollView style={fillHeight ? ui.sheetBody : undefined} bounces={fillHeight ? false : undefined} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={ui.sheetContent}>{children}</ScrollView>
        {confirmLabel !== null && <Pressable accessibilityRole="button" onPress={onClose} style={[ui.primary, compact && ui.filterConfirm]}><Text style={ui.primaryText}>{confirmLabel}</Text></Pressable>}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Lista acotada y buscable: conserva accesibles catálogos académicos extensos. */
export function FilterOptions({ label, options, value, onChange, allowEmpty = true, searchable = true, preserveOrder = false }: {
  label: string; options: { id: string; name: string; code?: string | null }[]; value: string; onChange: (id: string) => void; allowEmpty?: boolean; searchable?: boolean; preserveOrder?: boolean;
}) {
  const [search, setSearch] = useState(''), [limit, setLimit] = useState(20);
  const query = searchable ? search.trim().toLocaleLowerCase() : '';
  const matches = options.filter(row => `${row.name} ${row.code ?? ''}`.toLocaleLowerCase().includes(query));
  const selected = options.find(row => row.id === value);
  const remaining = preserveOrder ? matches : matches.filter(row => row.id !== value);
  const rows = preserveOrder ? remaining.slice(0, limit) : [ ...(selected ? [selected] : []), ...remaining.slice(0, limit) ];
  return <View style={ui.optionGroup}><Text style={ui.label}>{label}</Text>
    {searchable && options.length > 8 && <TextInput accessibilityLabel={`Buscar ${label.toLowerCase()} para filtrar`} placeholder="Nombre o código"
      value={search} onChangeText={text => { setSearch(text); setLimit(20); }} style={ui.input} />}
    <View style={ui.activeFilters}>{[...(allowEmpty ? [{ id: '', name: 'Cualquiera' }] : []), ...rows].map(row => <Pressable key={row.id} accessibilityRole="radio"
      accessibilityLabel={`${label}: ${row.name}`} accessibilityState={{ checked: value === row.id }} aria-checked={value === row.id}
      onPress={() => onChange(row.id)} style={[ui.option, value === row.id && ui.selectedOption]}>
      <Text style={[ui.optionText, value === row.id && ui.selectedText]}>{row.name}</Text>
    </Pressable>)}</View>
    {!matches.length && Boolean(query) && <Text style={ui.subtitle}>No hay coincidencias.</Text>}
    {remaining.length > limit && <Pressable accessibilityRole="button" onPress={() => setLimit(count => count + 20)} style={ui.back}><Text style={ui.link}>Mostrar más opciones</Text></Pressable>}
  </View>;
}

export function StatusTag({ children, neutral = false }: { children: ReactNode; neutral?: boolean }) {
  return <View style={[ui.tag, neutral && ui.neutralTag]}><Text style={[ui.tagText, neutral && ui.neutralTagText]}>{children}</Text></View>;
}

export function PriceTag({ modality, price }: { modality: string; price: number | null }) {
  return <StatusTag>{modality === 'DONACION' ? 'Donación' : `$${price?.toLocaleString('es-CL')}`}</StatusTag>;
}

export function EmptyState({ filtered, onClear, onPublish }: { filtered: boolean; onClear: () => void; onPublish: () => void }) {
  return <View style={ui.empty}><Search size={28} color={CATALOG_COLORS.secondary} /><Text style={ui.sectionTitle}>{filtered ? 'Sin coincidencias' : 'Aún no hay recursos'}</Text>
    <Text style={ui.emptyText}>{filtered ? 'Prueba con otra búsqueda o quita algunos filtros.' : 'Comparte un recurso y ayuda a tu comunidad.'}</Text>
    <Pressable accessibilityRole="button" onPress={filtered ? onClear : onPublish} style={ui.outlined}><Text style={ui.link}>{filtered ? 'Limpiar filtros' : 'Publicar un recurso'}</Text></Pressable>
  </View>;
}

export function CatalogSkeleton({ grid = false }: { grid?: boolean }) {
  return <Skeleton label="Cargando recursos" contentStyle={grid ? ui.grid : ui.skeletonRows}>
    {Array.from({ length: 4 }, (_, i) => <View key={i} style={[ui.skeletonCard, grid ? ui.gridCard : ui.skeletonRow]}>
      <SkeletonBlock style={ui.skeletonBlock} width={grid ? '100%' : 56} height={grid ? 110 : 68} />
      <View style={ui.skeletonText}><SkeletonBlock style={ui.skeletonBlock} width="90%" height={13} /><SkeletonBlock style={ui.skeletonBlock} width="65%" height={11} /><SkeletonBlock style={ui.skeletonBlock} width={68} height={22} /></View>
    </View>)}
  </Skeleton>;
}

export function CatalogPagination({ page, hasMore, loading, previous, next }: { page: number; hasMore: boolean; loading: boolean; previous: () => void; next: () => void }) {
  if (page === 1 && !hasMore) return null;
  return <View style={ui.pagination}><Pressable accessibilityRole="button" accessibilityLabel="Página anterior" disabled={loading || page === 1}
    onPress={previous} style={[ui.pageButton, (loading || page === 1) && ui.disabled]}><ChevronLeft size={18} color={CATALOG_COLORS.primary} /><Text style={ui.link}>Anterior</Text></Pressable>
    <Text style={ui.subtitle}>Página {page}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Página siguiente" disabled={loading || !hasMore} onPress={next}
      style={[ui.pageButton, (loading || !hasMore) && ui.disabled]}><Text style={ui.link}>Ver más</Text><ChevronRight size={18} color={CATALOG_COLORS.primary} /></Pressable>
  </View>;
}

export function PublishFAB({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" style={[ui.fabContainer, { bottom: safeAreaInset('bottom', insets.bottom, { min: 8, base: 102 }) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Publicar un recurso" onPress={onPress} style={ui.fab}>
      <Plus size={21} color="#FFFFFF" /><Text style={ui.primaryText}>Publicar</Text>
    </Pressable>
  </View>;
}

export function CatalogTabs<T extends string>({ tabs, selected, onSelect, variant = 'chips' }: { tabs: { id: T; label: string;badgeCount?:number;badgeLabel?:string }[]; selected: T; onSelect: (id: T) => void; variant?: 'chips' | 'underline' }) {
  const underline = variant === 'underline';
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={underline ? [ui.tabRow,tabs.some(tab=>(tab.badgeCount??0)>0)&&ui.tabRowWithBadges] : ui.chipRow} accessibilityRole="tablist">
    {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: selected === tab.id }} aria-selected={selected === tab.id}
      accessibilityLabel={tab.badgeCount!==undefined?`${tab.label}, ${tab.badgeCount} ${tab.badgeLabel??'pendientes'}`:tab.label}
      onPress={() => onSelect(tab.id)} style={underline ? [ui.tab, selected === tab.id && ui.selectedTab] : [ui.chip, selected === tab.id && ui.activeChip]}>
      <Text style={underline ? [ui.tabText, selected === tab.id && ui.selectedTabText] : [ui.chipText, selected === tab.id && ui.activeChipText]}>{tab.label}</Text>
      {typeof tab.badgeCount==='number'&&Number.isFinite(tab.badgeCount)&&tab.badgeCount>0&&<View accessible={false} aria-hidden style={ui.tabBadge}><Text style={ui.tabBadgeText}>{tab.badgeCount>99?'99+':tab.badgeCount}</Text></View>}
      </Pressable>)}
  </ScrollView>;
}

export const ui = StyleSheet.create({
  tabRow: { flexGrow: 1, gap: 12, borderBottomWidth: 1, borderBottomColor: CATALOG_COLORS.border },
  tabRowWithBadges:{gap:8},tabBadge:{minWidth:17,height:17,paddingHorizontal:4,borderRadius:9,backgroundColor:CATALOG_COLORS.primary,alignItems:'center',justifyContent:'center'},tabBadgeText:{color:CATALOG_COLORS.surface,fontSize:10,lineHeight:13,fontWeight:'700'},
  tab: { minHeight: 44, paddingHorizontal: 2, paddingVertical: 12, flexDirection:'row',alignItems:'center',gap:5,justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  selectedTab: { borderBottomColor: CATALOG_COLORS.primary }, tabText: { fontSize: 13, lineHeight: 19, color: CATALOG_COLORS.muted, fontWeight: '500' },
  selectedTabText: { color: CATALOG_COLORS.primary, fontWeight: '700' },
  header: { gap: 6 }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 26, fontWeight: '800', color: CATALOG_COLORS.primary, flexShrink: 1, letterSpacing: -0.6 },
  subtitle: { color: CATALOG_COLORS.muted, fontSize: 13, lineHeight: 20 },
  sectionTitle: { color: CATALOG_COLORS.ink, fontSize: 16, fontWeight: '800' },
  outlined: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: CATALOG_COLORS.inputBorder, paddingHorizontal: 12 },
  headerAction:{flexDirection:'row',gap:6,flexShrink:0},
  actionText: { fontSize: 12, fontWeight: '700', color: CATALOG_COLORS.primary }, link: { fontSize: 13, fontWeight: '700', color: CATALOG_COLORS.primary },
  back: { minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start' },
  search: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: CATALOG_COLORS.inputBorder, backgroundColor: '#FFFFFF', paddingLeft: 14, flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, paddingRight: 10, fontSize: 14, color: CATALOG_COLORS.ink },
  iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  filterGroup: { gap: 8 }, chipRow: { gap: 8, alignItems: 'center' }, chip: { minHeight: 44, paddingHorizontal: 15, borderRadius: 24, borderWidth: 1, borderColor: CATALOG_COLORS.inputBorder, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: CATALOG_COLORS.primary }, activeChip: { backgroundColor: CATALOG_COLORS.primary, borderColor: CATALOG_COLORS.primary }, activeChipText: { color: '#FFFFFF' },
  activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, removableChip: { minHeight: 44, maxWidth: '100%', borderRadius: 22, paddingHorizontal: 12, backgroundColor: CATALOG_COLORS.tint, flexDirection: 'row', alignItems: 'center', gap: 8 }, removableText: { fontSize: 12, color: CATALOG_COLORS.primary, flexShrink: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,36,58,0.4)' }, sheet: { width: '100%', maxWidth: 760, maxHeight: '90%', alignSelf: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', paddingHorizontal: 20, gap: 8 },
  compactSheet: { paddingTop: 8, paddingHorizontal: 16 }, filterConfirm: { borderRadius: 28, minHeight: 48 },
  filterLabel: { color: CATALOG_COLORS.secondary, fontSize: 12, fontWeight: '500' },
  fullSheet: { height: '90%', flexShrink: 1 }, sheetBody: { flex: 1, minHeight: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: CATALOG_COLORS.inputBorder, alignSelf: 'center', marginTop: 10 }, sheetContent: { gap: 20, paddingBottom: 20 },
  optionGroup: { gap: 8 }, label: { color: CATALOG_COLORS.ink, fontSize: 14, fontWeight: '700' }, input: { minHeight: 48, borderWidth: 1, borderColor: CATALOG_COLORS.inputBorder, borderRadius: 12, padding: 12, fontSize: 14, color: CATALOG_COLORS.ink },
  option: { minHeight: 44, maxWidth: '100%', padding: 12, borderWidth: 1, borderColor: CATALOG_COLORS.inputBorder, borderRadius: 12, justifyContent: 'center' }, optionText: { fontSize: 13, color: CATALOG_COLORS.muted }, selectedOption: { borderColor: CATALOG_COLORS.primary, backgroundColor: CATALOG_COLORS.tint }, selectedText: { color: CATALOG_COLORS.primary, fontWeight: '700' },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: CATALOG_COLORS.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 }, primaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  tag: { borderRadius: 8, backgroundColor: CATALOG_COLORS.tint, paddingHorizontal: 8, paddingVertical: 5, alignSelf: 'flex-start', maxWidth: '100%' }, tagText: { color: CATALOG_COLORS.primary, fontSize: 11, fontWeight: '700' }, neutralTag: { backgroundColor: '#EEF2F6' }, neutralTagText: { color: '#40596C' },
  empty: { alignItems: 'center', gap: 12, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: CATALOG_COLORS.border, backgroundColor: '#FFFFFF' }, emptyText: { fontSize: 14, lineHeight: 21, color: CATALOG_COLORS.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, gridCard: { width: '48%', flexGrow: 1, flexBasis: '46%' },
  skeletonBlock: { backgroundColor: CATALOG_COLORS.inputBorder },
  skeletonRows: { gap: 12 }, skeletonCard: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: CATALOG_COLORS.border }, skeletonRow: { padding: 12, flexDirection: 'row', gap: 12 }, skeletonText: { flex: 1, padding: 12, gap: 10 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, pageButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }, disabled: { opacity: 0.4 },
  fabContainer: { position: 'absolute', right: 20 }, fab: { minHeight: 52, paddingHorizontal: 18, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CATALOG_COLORS.primary, boxShadow: '0 4px 12px rgba(0,46,86,0.2)' },
});
