import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshScrollView, type ScrollRefreshState } from '@/components/RefreshScrollView';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';

/** Un solo scroll por modal; refresco opcional y encabezado siempre accesible. */
export function AgreementStepModal({ title, closeLabel, onClose, closeDisabled = false, children, refresh, fillHeight = false, overlay }: {
  title: string; closeLabel: string; onClose: () => void; closeDisabled?: boolean; children: ReactNode;
  refresh?: ScrollRefreshState; fillHeight?: boolean; overlay?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const close = () => { if (!closeDisabled) onClose(); };
  const contentStyle = [styles.content, { paddingBottom: Math.max(18, insets.bottom + 8) }];
  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    <View style={[styles.overlay, { paddingTop: Math.max(20, insets.top + 8), paddingBottom: Math.max(20, insets.bottom + 8) }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={closeDisabled} onPress={close} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.dialog, fillHeight && styles.fullDialog]}>
        <View accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={styles.heading}><Text accessibilityRole="header" style={[ui.sectionTitle, { flex: 1 }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} disabled={closeDisabled} accessibilityState={{ disabled: closeDisabled }} onPress={close} style={ui.iconButton}><X size={22} color={colors.primary} /></Pressable>
        </View>
        {refresh ? <RefreshScrollView style={[styles.body, fillHeight && { flex: 1 }]} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled"
          onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} refreshEnabled={refresh.enabled} refreshLabel={refresh.label} refreshIndicatorOffset={8}>{children}</RefreshScrollView>
          : <ScrollView accessibilityElementsHidden={Boolean(overlay)} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={styles.body} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">{children}</ScrollView>}
        {overlay}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, paddingHorizontal: 16, backgroundColor: 'rgba(9,36,58,0.45)', justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 760, maxHeight: '100%', flexShrink: 1, backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
  fullDialog: { height: '100%' }, body: { flexShrink: 1, minHeight: 0 },
  heading: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  content: { padding: 18, gap: 16 },
});
