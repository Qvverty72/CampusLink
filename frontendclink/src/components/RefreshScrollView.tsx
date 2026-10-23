import { APP_COLORS } from '@/types/colors';
import { createContext, forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';

export type ScrollRefreshState = { onRefresh: () => void; refreshing: boolean; enabled: boolean; label: string };
const RefreshContext = createContext<{
  register: (state: ScrollRefreshState | null) => void;
  resetScroll: () => void;
  closeModal?: () => void;
  setHeaderVisible?: (visible: boolean) => void;
} | null>(null);
const PULL_THRESHOLD = 64;

/** Registra la vista de datos visible; formularios desmontados no compiten por actualizar. */
export function useScrollRefresh(onRefresh: () => void, refreshing: boolean, enabled: boolean, label = 'el contenido') {
  const register = useContext(RefreshContext)?.register;
  useLayoutEffect(() => {
    register?.({ onRefresh, refreshing, enabled, label });
    return () => register?.(null);
  }, [register, onRefresh, refreshing, enabled, label]);
}

/** Restablece el scroll del modal cuando cambia la pantalla visible. */
export function useScrollReset(viewKey: string) {
  const resetScroll = useContext(RefreshContext)?.resetScroll;
  useLayoutEffect(() => { resetScroll?.(); }, [resetScroll, viewKey]);
}

/** Una pantalla compacta aporta su propio cierre y restaura el encabezado al salir. */
export function useCompactScrollHeader() {
  const controls = useContext(RefreshContext);
  const setHeaderVisible = controls?.setHeaderVisible;
  useLayoutEffect(() => {
    setHeaderVisible?.(false);
    return () => setHeaderVisible?.(true);
  }, [setHeaderVisible]);
  return controls?.closeModal;
}

/** Se monta junto a la lista o resumen, incluidos sus estados de carga y error. */
export function ScrollRefreshRegistration({ onRefresh, refreshing, enabled, label }: ScrollRefreshState) {
  useScrollRefresh(onRefresh, refreshing, enabled, label);
  return null;
}

/** Controla el scroll del modal con refresco nativo y gesto táctil equivalente en RN Web. */
export type RefreshScrollViewProps = ScrollViewProps & {
  onClose?: () => void;
  onHeaderVisibilityChange?: (visible: boolean) => void;
  /** Una pantalla puede controlar el refresh directamente; los modales pueden registrar su vista hija. */
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshEnabled?: boolean;
  refreshLabel?: string;
  indicatorColor?: string;
  refreshIndicatorOffset?: number;
};
export const RefreshScrollView = forwardRef<ScrollView, RefreshScrollViewProps>(function RefreshScrollView(
  { children, onClose, onHeaderVisibilityChange, onRefresh, refreshing: controlledRefreshing = false,
    refreshEnabled = true, refreshLabel = 'el contenido', indicatorColor = APP_COLORS.PRIMARY, refreshIndicatorOffset = 0, ...props }, forwardedRef,
) {
  const scroll = useRef<ScrollView | null>(null);
  const [registeredState, register] = useState<ScrollRefreshState | null>(null);
  // Las props directas tienen prioridad; sin ellas, manda la vista registrada en este scroll.
  const state = onRefresh ? { onRefresh, refreshing: controlledRefreshing, enabled: refreshEnabled, label: refreshLabel } : registeredState;
  const resetScroll = useCallback(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, []);
  const latest = useRef(state);
  latest.current = state;
  const locked = useRef(false);
  const [requested, setRequested] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const assignRef = useCallback((value: ScrollView | null) => {
    scroll.current = value;
    if (typeof forwardedRef === 'function') forwardedRef(value);
    else if (forwardedRef) forwardedRef.current = value;
  }, [forwardedRef]);
  const refresh = useCallback(() => {
    const current = latest.current;
    if (!current?.enabled || current.refreshing || locked.current) return;
    locked.current = true;
    setRequested(true);
    current.onRefresh();
  }, []);
  useEffect(() => {
    if (!state?.refreshing) {
      locked.current = false;
      setRequested(false);
    }
  }, [state?.refreshing]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = scroll.current?.getScrollableNode() as HTMLElement | undefined;
    if (!node) return;
    let gesture: { x: number; y: number; identifier: number; distance: number } | null = null;
    const previousOverscroll = node.style.overscrollBehaviorY;
    node.style.overscrollBehaviorY = 'contain';
    const cancel = () => { gesture = null; setPullDistance(0); };
    const start = (event: TouchEvent) => {
      cancel();
      if (event.touches.length !== 1 || node.scrollTop > 0 || !latest.current?.enabled || locked.current) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, identifier: touch.identifier, distance: 0 };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1 || !latest.current?.enabled || locked.current || node.scrollTop > 0) { cancel(); return; }
      const touch = event.touches[0];
      const distance = touch.clientY - gesture.y;
      if (touch.identifier !== gesture.identifier || distance < 0 || Math.abs(touch.clientX - gesture.x) > Math.max(10, distance)) { cancel(); return; }
      if (distance > 0) {
        // El listener no pasivo evita que el gesto también recargue la página del navegador.
        if (event.cancelable) event.preventDefault();
        gesture.distance = distance;
        setPullDistance(Math.min(distance, 160));
      }
    };
    const end = () => {
      const shouldRefresh = gesture !== null && gesture.distance >= PULL_THRESHOLD;
      cancel();
      if (shouldRefresh) refresh();
    };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', cancel);
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', cancel);
      node.style.overscrollBehaviorY = previousOverscroll;
    };
  }, [refresh]);

  // El control nativo necesita true desde onRefresh, antes de que los efectos de datos activen loading.
  const refreshing = requested;
  const active = Boolean(state?.enabled);
  const label = state?.label ?? 'el contenido';
  return <RefreshContext.Provider value={{ register, resetScroll, closeModal: onClose, setHeaderVisible: onHeaderVisibilityChange }}>
    <ScrollView {...props} ref={assignRef} alwaysBounceVertical={props.alwaysBounceVertical ?? true}
      accessibilityHint={active ? `Desliza hacia abajo desde el inicio para actualizar ${label}.` : props.accessibilityHint}
      accessibilityActions={active ? [{ name: 'activate', label: `Actualizar ${label}` }] : props.accessibilityActions}
      onAccessibilityAction={event => {
        if (active && event.nativeEvent.actionName === 'activate') refresh();
        else props.onAccessibilityAction?.(event);
      }}
      // ScrollView nativo cambia su jerarquía host al agregar/quitar este control.
      // Se mantiene montado para que registrar una hoja no reinicie el navegador de actividades.
      refreshControl={Platform.OS !== 'web' ? <RefreshControl
        enabled={active || refreshing} refreshing={refreshing} onRefresh={refresh}
        progressViewOffset={refreshIndicatorOffset}
        colors={[indicatorColor]} tintColor={indicatorColor} /> : undefined}>
      {Platform.OS === 'web' && (refreshing || (active && pullDistance > 0)) ? <View
        style={[styles.indicator, { height: refreshing ? 48 : Math.min(80, pullDistance) }]}>
        <ActivityIndicator color={indicatorColor} accessibilityLabel={refreshing ? `Actualizando ${label}` : 'Desliza para actualizar'} />
        <Text accessibilityLiveRegion="polite" aria-live="polite" style={[styles.hint, { color: indicatorColor }]}>{refreshing ? `Actualizando ${label}…`
          : pullDistance >= PULL_THRESHOLD ? 'Suelta para actualizar' : 'Desliza para actualizar'}</Text>
      </View> : null}
      {children}
    </ScrollView>
  </RefreshContext.Provider>;
});

const styles = StyleSheet.create({
  indicator: { alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  hint: { fontSize: 12, color: APP_COLORS.PRIMARY },
});
