import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { APP_COLORS } from '@/types/colors';

type PageItem = number | 'ellipsis';
const BUTTON_SIZE = 44;
const DOTS_WIDTH = 16;
const GAP = 8;
const STRIP_PADDING = 4;

/** Calcula una tira acotada que conserva extremos y página actual con puntos suspensivos. */
export function getPaginationItems(page: number, totalPages: number, numberBudget: number): PageItem[] {
  if (totalPages <= numberBudget) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (numberBudget < 3) return [page];

  const leading = Math.ceil(numberBudget / 2);
  const trailing = numberBudget - leading;
  let numbers: number[];
  if (page <= leading) {
    numbers = [...Array.from({ length: leading }, (_, index) => index + 1),
      ...Array.from({ length: trailing }, (_, index) => totalPages - trailing + index + 1)];
  } else if (page > totalPages - leading) {
    numbers = [...Array.from({ length: trailing }, (_, index) => index + 1),
      ...Array.from({ length: leading }, (_, index) => totalPages - leading + index + 1)];
  } else {
    const neighbors = numberBudget - 2;
    const start = Math.min(totalPages - neighbors,
      Math.max(2, page - Math.floor((neighbors - 1) / 2)));
    numbers = [1, ...Array.from({ length: neighbors }, (_, index) => start + index), totalPages];
  }
  const items: PageItem[] = [];
  for (const number of numbers) {
    const previous = items[items.length - 1];
    if (typeof previous === 'number' && number > previous + 1) items.push('ellipsis');
    items.push(number);
  }
  return items;
}

/** Renderiza navegación accesible y limita la cantidad de botones al ancho disponible. */
export function Pagination({ page, totalPages, visitedPages = page, hasNextPage = false, disabled = false,
  onPageChange, label = 'Paginación', showSinglePage = false }: {
  page: number;
  /** Sin total, los números representan sólo páginas ya consultadas mediante cursor. */
  totalPages?: number;
  visitedPages?: number;
  hasNextPage?: boolean;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  label?: string;
  showSinglePage?: boolean;
}) {
  const [width, setWidth] = useState(280);
  const knownTotal = totalPages !== undefined;
  const lastPage = knownTotal ? totalPages : Math.max(1, visitedPages, page);
  if (lastPage <= 0 || (lastPage <= 1 && !hasNextPage && !showSinglePage)) return null;
  const current = Math.max(1, Math.min(page, lastPage));
  // Reserva espacio para flechas, separaciones, contenedor y hasta dos puntos suspensivos.
  const numberBudget = Math.max(1, Math.min(6,
    Math.floor((width - BUTTON_SIZE * 2 - GAP * 2 - STRIP_PADDING * 2 - DOTS_WIDTH * 2) / BUTTON_SIZE)));
  const items = getPaginationItems(current, lastPage, numberBudget);
  const previousDisabled = disabled || current === 1;
  const nextDisabled = disabled || (knownTotal ? current === lastPage : !hasNextPage);
  const goTo = (target: number) => {
    const limit = lastPage + (!knownTotal && hasNextPage ? 1 : 0);
    if (!disabled && target >= 1 && target <= limit && target !== current) onPageChange(target);
  };
  return <View style={styles.pagination} accessibilityLabel={label}
    onLayout={event => { if (event.nativeEvent.layout.width > 0) setWidth(event.nativeEvent.layout.width); }}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Página anterior"
      disabled={previousDisabled} accessibilityState={{ disabled: previousDisabled }}
      aria-disabled={previousDisabled} activeOpacity={0.7} onPress={() => goTo(current - 1)}
      style={[styles.arrow, previousDisabled && styles.arrowDisabled]}>
      <View accessible={false} aria-hidden accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={styles.icon}>
        <ChevronLeft size={20} color={previousDisabled ? '#94A3B8' : '#FFFFFF'} />
      </View>
    </TouchableOpacity>
    <View style={styles.pages}>
      {items.map((item, index) => item === 'ellipsis'
        ? <Text key={`gap-${index}`} accessible={false} aria-hidden style={styles.dots}>…</Text>
        : <TouchableOpacity key={item} accessibilityRole="button"
          accessibilityLabel={`Página ${item}${knownTotal ? ` de ${totalPages}` : ''}${item === current ? ', actual' : ''}`}
          disabled={disabled} accessibilityState={{ selected: item === current, disabled }} aria-current={item === current ? 'page' : undefined}
          activeOpacity={0.7} onPress={() => goTo(item)} style={styles.pageButton}>
          <View style={[styles.pageMark, item === current && styles.pageMarkActive]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
              style={[styles.number, item === current && styles.numberActive]}>{item}</Text>
          </View>
        </TouchableOpacity>)}
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Página siguiente"
      disabled={nextDisabled} accessibilityState={{ disabled: nextDisabled }} aria-disabled={nextDisabled}
      activeOpacity={0.7} onPress={() => goTo(current + 1)} style={[styles.arrow, nextDisabled && styles.arrowDisabled]}>
      <View accessible={false} aria-hidden accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={styles.icon}>
        <ChevronRight size={20} color={nextDisabled ? '#94A3B8' : '#FFFFFF'} />
      </View>
    </TouchableOpacity>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{`Página ${current}${knownTotal ? ` de ${totalPages}` : ''}`}</Text>
  </View>;
}

const styles = StyleSheet.create({
  pagination: { width: '100%', maxWidth: 500, alignSelf: 'center', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: GAP, marginTop: 8 },
  arrow: { width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: APP_COLORS.PRIMARY },
  arrowDisabled: { backgroundColor: '#F1F3F5' },
  icon: { pointerEvents: 'none' },
  pages: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: STRIP_PADDING,
    borderRadius: 24, backgroundColor: '#F3F4F6' },
  pageButton: { width: BUTTON_SIZE, height: BUTTON_SIZE, alignItems: 'center', justifyContent: 'center' },
  pageMark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pageMarkActive: { backgroundColor: APP_COLORS.PRIMARY,
    shadowColor: APP_COLORS.PRIMARY, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 2 },
  number: { fontSize: 14, color: '#475569', textAlign: 'center', maxWidth: 30 },
  numberActive: { color: '#FFFFFF', fontWeight: '600' },
  dots: { width: DOTS_WIDTH, textAlign: 'center', fontSize: 16, color: '#64748B' },
  status: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', color: 'transparent', pointerEvents: 'none' },
});
