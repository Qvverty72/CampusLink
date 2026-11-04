import { useEffect, useRef, type ComponentRef, type ReactNode, type Ref, type RefObject } from 'react';
import { Link } from 'expo-router';
import { ArrowLeft, ArrowRight, TriangleAlert, X } from 'lucide-react-native';
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { RefreshScrollView, type ScrollRefreshState } from '@/components/RefreshScrollView';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { colors as c, styles as s } from './analytics.styles';

export type AnalyticsFocusTarget = ComponentRef<typeof View>;

export function AnalyticsButton({ children, onPress, label, disabled, disabledReason, hint, secondary, quiet, icon, buttonRef }: {
  children: string; onPress: () => void; label?: string; disabled?: boolean; disabledReason?: string; hint?: string; secondary?: boolean; quiet?: boolean; icon?: ReactNode; buttonRef?: Ref<AnalyticsFocusTarget>;
}) {
  const button = <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={label ?? children} accessibilityState={{ disabled: !!disabled }}
    accessibilityHint={disabled ? disabledReason : hint}
    disabled={disabled} onPress={onPress} android_ripple={{ color: secondary || quiet ? '#DCE8F1' : '#3F6A8E' }}
    style={StyleSheet.flatten([s.button, secondary && s.buttonSecondary, quiet && s.buttonQuiet, disabled && s.disabled])}>
    {icon && <View accessible={false} aria-hidden>{icon}</View>}
    <Text style={[s.buttonText, (secondary || quiet) && { color: c.PRIMARY }]}>{children}</Text>
  </Pressable>;
  return disabled && disabledReason ? <View style={{ gap: 4, maxWidth: '100%' }}>{button}<Text style={s.small}>{disabledReason}</Text></View> : button;
}

export function AnalyticsPage({ children, history = false, footer, refresh, scrollRef }: {
  children: ReactNode; history?: boolean; footer?: ReactNode; refresh?: ScrollRefreshState; scrollRef?: Ref<ScrollViewInstance>;
}) {
  const insets = useSafeAreaInsets();
  const PageScrollView = refresh ? RefreshScrollView : ScrollView;
  return <View style={s.screen}>
    <PageScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
      {...(refresh && { onRefresh: refresh.onRefresh, refreshing: refresh.refreshing, refreshEnabled: refresh.enabled,
        refreshLabel: refresh.label, refreshIndicatorOffset: insets.top + 8 })} contentContainerStyle={{
      paddingTop: safeAreaInset('top', insets.top, { offset: 8 }),
      paddingBottom: footer ? 20 : safeAreaInset('bottom', insets.bottom, { min: 24 }),
      paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }),
    }}>
      <View style={s.content}>
        <View>
          <Link href="/(user)/profile" asChild><Pressable accessibilityRole="link" style={StyleSheet.flatten(s.back)}>
            <ArrowLeft size={17} color={c.PRIMARY} aria-hidden /><Text style={s.link}>Mi perfil</Text>
          </Pressable></Link>
          <View style={s.row}><View style={s.grow}><Text accessibilityRole="header" style={s.title}>Analítica</Text>
            <Text style={s.muted}>La actividad de tu comunidad, en cifras.</Text></View>
          </View>
        </View>
        <View style={s.tabs}>
          <Link href="/(analytics)/analytics" asChild><Pressable accessibilityRole="link" accessibilityState={{ selected: !history }} style={StyleSheet.flatten([s.tab, !history && s.tabActive])}>
            <Text style={history ? s.muted : s.link}>Resumen</Text></Pressable></Link>
          <Link href="/(analytics)/history" asChild><Pressable accessibilityRole="link" accessibilityState={{ selected: history }} style={StyleSheet.flatten([s.tab, history && s.tabActive])}>
            <Text style={history ? s.link : s.muted}>Reportes guardados</Text>
          </Pressable></Link>
        </View>
        {children}
      </View>
    </PageScrollView>
    {!!footer && <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: c.border,
      paddingTop: 10, paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 12 }),
      paddingLeft: safeAreaInset('left', insets.left, { min: 16 }), paddingRight: safeAreaInset('right', insets.right, { min: 16 }) }}>
      <View style={s.content}>{footer}</View>
    </View>}
  </View>;
}

export function AnalyticsModal({ title, onClose, children, returnFocusRef, showCloseButton = true }: {
  title: string; onClose: () => void; children: ReactNode; returnFocusRef?: RefObject<AnalyticsFocusTarget | null>; showCloseButton?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const closeRef = useRef<AnalyticsFocusTarget>(null);
  const headingRef = useRef<ComponentRef<typeof Text>>(null);
  const focus = (target: AnalyticsFocusTarget | null) => {
    target?.focus?.();
    if (target && Platform.OS !== 'web') {
      const handle = findNodeHandle(target);
      if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
    }
  };
  useEffect(() => () => focus(returnFocusRef?.current ?? null), [returnFocusRef]);
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} onShow={() => focus(showCloseButton ? closeRef.current : headingRef.current)}>
    <View style={s.modal} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={[s.modalHeader, { paddingTop: safeAreaInset('top', insets.top, { min: 12 }) }]}>
        <Text ref={headingRef} tabIndex={-1} accessible accessibilityRole="header" style={[s.heading, s.grow]}>{title}</Text>
        {showCloseButton && <Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel={`Cerrar ${title.toLocaleLowerCase('es')}`} onPress={onClose} style={s.iconButton}><X size={22} color={c.PRIMARY} aria-hidden /></Pressable>}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 24 }) }}>
        <View style={s.content}>{children}</View>
      </ScrollView>
    </View>
  </Modal>;
}

export function AnalyticsMessage({ title, children, error, onRetry }: { title: string; children: string; error?: boolean; onRetry?: () => void }) {
  return <View style={s.card}>
    <View style={s.row}><TriangleAlert size={21} color={error ? c.danger : c.SECONDARY} aria-hidden /><Text style={[s.label, s.grow, error && { color: c.danger }]}>{title}</Text></View>
    <Text accessibilityRole={error ? 'alert' : undefined} style={s.muted}>{children}</Text>
    {onRetry && <AnalyticsButton secondary onPress={onRetry} icon={<ArrowRight size={16} color={c.PRIMARY} />}>Reintentar consulta</AnalyticsButton>}
  </View>;
}

export function AnalyticsSkeleton({ label = 'Cargando indicadores' }: { label?: string }) {
  return <Skeleton label={label} contentStyle={s.stack}>
    <View style={s.wrap}>{[0, 1, 2, 3].map(key => <View key={key} style={[s.card, { flexBasis: 220, flexGrow: 1, gap: 16 }]}>
      <SkeletonBlock width="65%" height={14} /><SkeletonBlock width="45%" height={38} /><SkeletonBlock width="85%" height={12} />
    </View>)}</View>
    <View style={s.card}><SkeletonBlock width="45%" height={18} /><SkeletonBlock height={220} borderRadius={12} /></View>
  </Skeleton>;
}
