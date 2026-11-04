import { safeAreaInset } from '@/lib/layout/safeArea';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshScrollView, type ScrollRefreshState } from '@/components/RefreshScrollView';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';

/** Un solo scroll por modal; refresco opcional y encabezado siempre accesible. */
export function AgreementStepModal({ title, closeLabel, onClose, closeDisabled = false, children, refresh, fillHeight = false, preferredHeight, overlay, footer, contentStyle, keyboardAvoiding = false, contentKey }: {
  title: string; closeLabel: string; onClose: () => void; closeDisabled?: boolean; children: ReactNode;
  refresh?: ScrollRefreshState; fillHeight?: boolean; preferredHeight?: number; overlay?: ReactNode; footer?:ReactNode; contentStyle?: StyleProp<ViewStyle>; keyboardAvoiding?: boolean; contentKey?: string;
}) {
  const insets = useSafeAreaInsets();
  const fixedHeight = fillHeight || preferredHeight !== undefined;
  const close = () => { if (!closeDisabled) onClose(); };
  const bodyContentStyle = [styles.content, contentStyle, { paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 18, offset: 8 }) }];
  return <Modal visible transparent animationType="fade" onRequestClose={close}><KeyboardAvoidingView enabled={keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <View style={[styles.overlay, { paddingTop: safeAreaInset('top', insets.top, { min: 20, offset: 8 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 20, offset: 8 }) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={closeDisabled} onPress={close} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.dialog, fixedHeight && styles.fullDialog, preferredHeight !== undefined && { height: preferredHeight }]}>
        <View accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={styles.heading}><Text accessibilityRole="header" style={[ui.sectionTitle, { flex: 1 }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={closeDisabled} accessibilityState={{ disabled: closeDisabled }} onPress={close} style={ui.iconButton}><X size={22} color={colors.primary} /></Pressable>
        </View>
        {refresh ? <RefreshScrollView key={contentKey} accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={[styles.body, fixedHeight && { flex: 1 }]} contentContainerStyle={bodyContentStyle} keyboardShouldPersistTaps="handled"
          onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} refreshEnabled={refresh.enabled} refreshLabel={refresh.label} refreshIndicatorOffset={8}>{children}</RefreshScrollView>
          : <ScrollView key={contentKey} accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={[styles.body, fixedHeight && { flex: 1 }]} contentContainerStyle={bodyContentStyle} keyboardShouldPersistTaps="handled">{children}</ScrollView>}
        {footer&&<View accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay?'no-hide-descendants':'auto'} style={[styles.footer,{paddingBottom:safeAreaInset('bottom',insets.bottom,{min:12,offset:8})}]}>{footer}</View>}
        {overlay}
      </View>
    </View>
  </KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, paddingHorizontal: 16, backgroundColor: 'rgba(9,36,58,0.45)', justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 760, maxHeight: '100%', flexShrink: 1, backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
  fullDialog: { height: '100%' }, body: { flexShrink: 1, minHeight: 0 },
  heading: { flexShrink: 0, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  content: { padding: 18, gap: 16 },
  footer:{flexShrink:0,paddingHorizontal:12,paddingTop:8,borderTopWidth:1,borderColor:colors.border,backgroundColor:colors.surface},
});
