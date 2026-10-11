import { APP_COLORS } from '@/types/colors';
import { createContext, forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from 'react-native';

type ViewRefresh = { onRefresh: () => void; refreshing: boolean; enabled: boolean; label: string };
const RefreshContext = createContext<((state: ViewRefresh | null) => void) | null>(null);
const PULL_THRESHOLD = 64;

/** Register one visible data view; unmounted views and forms never compete for refresh. */
export function useActivityRefresh(onRefresh: () => void, refreshing: boolean, enabled: boolean, label = 'la ficha') {
  const register = useContext(RefreshContext);
  useLayoutEffect(() => {
    register?.({ onRefresh, refreshing, enabled, label });
    return () => register?.(null);
  }, [register, onRefresh, refreshing, enabled, label]);
}

/** Mount alongside a list or overview, including its loading and error states. */
export function ActivityRefreshRegistration({ onRefresh, refreshing, enabled, label }: ViewRefresh) {
  useActivityRefresh(onRefresh, refreshing, enabled, label);
  return null;
}

/** Own the existing modal scroll, with native refresh and a touch equivalent for RN Web. */
export const ActivityRefreshScrollView = forwardRef<ScrollView, ScrollViewProps>(function ActivityRefreshScrollView(
  { children, ...props }, forwardedRef,
) {
  const scroll = useRef<ScrollView | null>(null);
  const [state, register] = useState<ViewRefresh | null>(null);
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
        // A non-passive listener prevents this gesture from refreshing the browser page.
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

  const refreshing = requested && Boolean(state?.refreshing);
  const active = Boolean(state?.enabled);
  const label = state?.label ?? 'el contenido';
  return <RefreshContext.Provider value={register}>
    <ScrollView {...props} ref={assignRef} alwaysBounceVertical={props.alwaysBounceVertical ?? true}
      accessibilityHint={active ? `Desliza hacia abajo desde el inicio para actualizar ${label}.` : props.accessibilityHint}
      accessibilityActions={active ? [{ name: 'activate', label: `Actualizar ${label}` }] : props.accessibilityActions}
      onAccessibilityAction={event => {
        if (active && event.nativeEvent.actionName === 'activate') refresh();
        else props.onAccessibilityAction?.(event);
      }}
      // Native ScrollView changes its host hierarchy when this control is added/removed.
      // Keep it mounted so registering a sheet does not remount the activities browser.
      refreshControl={Platform.OS !== 'web' ? <RefreshControl
        enabled={active && !requested} refreshing={refreshing} onRefresh={refresh}
        colors={[APP_COLORS.PRIMARY]} tintColor={APP_COLORS.PRIMARY} /> : undefined}>
      {Platform.OS === 'web' && (refreshing || (active && pullDistance > 0)) ? <View
        style={[styles.indicator, { height: refreshing ? 48 : Math.min(80, pullDistance / 2) }]}>
        {refreshing ? <ActivityIndicator color={APP_COLORS.PRIMARY} accessibilityLabel={`Actualizando ${label}`} /> : null}
        <Text accessibilityLiveRegion="polite" aria-live="polite" style={styles.hint}>{refreshing ? `Actualizando ${label}…`
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
