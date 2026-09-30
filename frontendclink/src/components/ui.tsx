import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, usePathname, type Href } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

export const go = (path: string) => router.push(path as Href);
export const back = (fallback = '/') => router.canGoBack() ? router.back() : router.replace(fallback as Href);

export function Button({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [ui.button, secondary && ui.secondaryButton, (pressed || disabled) && ui.dim]}>
    <Text style={[ui.buttonText, secondary && ui.secondaryButtonText]}>{label}</Text>
  </Pressable>;
}

export function AppHeader({ title = 'CampusLink', canGoBack = false }: { title?: string; canGoBack?: boolean }) {
  return <View style={ui.header}>
    {canGoBack && <Button label="Volver" secondary onPress={() => back()} />}
    <Text accessibilityRole="header" style={ui.wordmark}>{title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Notificaciones" onPress={() => go('/placeholder/notificaciones')}
      style={({ pressed }) => [ui.iconButton, pressed && ui.dim]}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={ui.bell}>
        <View style={ui.bellBody} /><View style={ui.bellBase} /><View style={ui.bellClapper} />
      </View>
    </Pressable>
  </View>;
}

export function Screen({ title, children, canGoBack = true }: { title: string; children: ReactNode; canGoBack?: boolean }) {
  return <KeyboardAvoidingView style={ui.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <AppHeader canGoBack={canGoBack} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.page}>
      <Text accessibilityRole="header" style={ui.title}>{title}</Text>
      {children}
    </ScrollView>
  </KeyboardAvoidingView>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: { label: string; onPress: () => void } }) {
  return <View style={ui.section}>
    <View style={ui.row}><Text accessibilityRole="header" style={[ui.heading, ui.grow]}>{title}</Text>
      {action && <Button secondary {...action} />}</View>
    {children}
  </View>;
}

export function Card({ children }: { children: ReactNode }) { return <View style={ui.card}>{children}</View>; }
export function Badge({ children }: { children: ReactNode }) { return <View style={ui.badge}><Text style={ui.badgeText}>{children}</Text></View>; }
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[ui.chip, selected && ui.chipSelected]}>
    <Text style={[ui.body, selected && ui.chipText]}>{label}</Text>
  </Pressable>;
}
export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={ui.field}><Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.textSecondary} {...props} style={[ui.input, props.multiline && ui.textarea, props.style]} />
    {error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
  </View>;
}
export function SearchBar({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return <Field label="Buscar" placeholder="Nombre, categoría o asignatura" value={value} onChangeText={onChangeText} returnKeyType="search" />;
}
export function ImagePlaceholder({ label = 'Imagen de ejemplo', large = false }: { label?: string; large?: boolean }) {
  return <View style={[ui.placeholder, large && ui.largePlaceholder]}><Text style={ui.muted}>{label}</Text></View>;
}
export function EmptyState({ title = 'No encontramos resultados', description = 'Prueba otra búsqueda o elimina los filtros.' }: { title?: string; description?: string }) {
  return <Card><Text style={ui.heading}>{title}</Text><Text style={ui.muted}>{description}</Text></Card>;
}
export function LoadingState() { return <View accessibilityLiveRegion="polite" style={ui.card}><ActivityIndicator color={colors.brandPrimary} /><Text style={ui.muted}>Cargando contenido de ejemplo…</Text></View>; }

function Overlay({ visible, title, onClose, children, sheet = false }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; sheet?: boolean }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={[ui.overlay, sheet && ui.sheetOverlay]}>
      <View accessibilityViewIsModal style={[ui.dialog, sheet && ui.sheet]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.dialogContent}>
          <Text accessibilityRole="header" style={ui.heading}>{title}</Text>{children}
          <Button secondary label="Cerrar" onPress={onClose} />
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}
export function BottomSheet(props: Omit<Parameters<typeof Overlay>[0], 'sheet'>) { return <Overlay {...props} sheet />; }
export function Confirmation({ visible, title, description, onClose, onConfirm }: { visible: boolean; title: string; description: string; onClose: () => void; onConfirm: () => void }) {
  return <Overlay visible={visible} title={title} onClose={onClose}><Text style={ui.body}>{description}</Text><Button label="Confirmar" onPress={onConfirm} /></Overlay>;
}

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A success from a previous screen must not look like feedback for a new task.
  useEffect(() => { clearTimeout(timer.current); setMessage(''); }, [pathname]);
  const show = (text: string) => { clearTimeout(timer.current); setMessage(text); timer.current = setTimeout(() => setMessage(''), 3500); };
  return <ToastContext.Provider value={show}><View style={ui.fill}>{children}
    {!!message && <View pointerEvents="none" accessibilityLiveRegion="polite" style={ui.toast}><Text style={ui.toastText}>{message}</Text></View>}
  </View></ToastContext.Provider>;
}

export const ui = StyleSheet.create({
  fill: { flex: 1 }, grow: { flex: 1, minWidth: 0 },
  page: { padding: 20, paddingBottom: 32, gap: 20, width: '100%', maxWidth: 920, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  wordmark: { flex: 1, color: colors.brandPrimary, fontSize: 21, fontWeight: '700' },
  title: { color: colors.textPrimary, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  heading: { color: colors.textPrimary, fontSize: 20, fontWeight: '600' },
  body: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  section: { gap: 12, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
  button: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.brandPrimary, justifyContent: 'center', alignItems: 'center' },
  secondaryButton: { backgroundColor: colors.surfaceElevated },
  buttonText: { color: colors.onBrand, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  secondaryButtonText: { color: colors.brandPrimary }, dim: { opacity: 0.55 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceElevated },
  bell: { width: 24, height: 26, alignItems: 'center' },
  bellBody: { width: 16, height: 17, borderWidth: 2, borderColor: colors.brandPrimary, borderTopLeftRadius: 9, borderTopRightRadius: 9, marginTop: 2 },
  bellBase: { width: 22, height: 2, backgroundColor: colors.brandPrimary },
  bellClapper: { width: 5, height: 3, marginTop: 2, borderRadius: 2, backgroundColor: colors.brandPrimary },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.surfaceElevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: colors.brandPrimary, fontSize: 12, fontWeight: '600' },
  chip: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 16, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, chipText: { color: colors.onBrand },
  field: { gap: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: colors.surface, color: colors.textPrimary, fontSize: 16 },
  textarea: { minHeight: 100, textAlignVertical: 'top' }, error: { color: colors.error, fontSize: 14, lineHeight: 21 },
  placeholder: { minHeight: 64, backgroundColor: colors.surfaceElevated, borderRadius: 10, padding: 16, justifyContent: 'center', alignItems: 'center' },
  largePlaceholder: { minHeight: 160 },
  overlay: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay }, sheetOverlay: { justifyContent: 'flex-end' },
  dialog: { width: '100%', maxWidth: 500, maxHeight: '90%', borderRadius: 16, backgroundColor: colors.surface }, sheet: { maxWidth: 680 }, dialogContent: { padding: 20, gap: 18 },
  toast: { position: 'absolute', bottom: 80, left: 20, right: 20, maxWidth: 600, alignSelf: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.textPrimary },
  toastText: { color: colors.onBrand, fontSize: 14, textAlign: 'center' },
});
