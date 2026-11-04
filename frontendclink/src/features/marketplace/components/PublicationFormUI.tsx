import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gift, Tag, UploadCloud } from 'lucide-react-native';
import { CATALOG_COLORS as c } from './CatalogUI';

export function PublicationSection({ number, title, hint, children }: { number: string; title: string; hint?: string; children: ReactNode }) {
  return <View style={publicationUI.section}>
    <View style={publicationUI.sectionHeading}><View style={publicationUI.number}><Text style={publicationUI.numberText}>{number}</Text></View>
      <Text accessibilityRole="header" style={publicationUI.title}>{title}</Text></View>
    {hint && <Text style={publicationUI.hint}>{hint}</Text>}{children}
  </View>;
}

export function PublicationModality({ value, onChange, disabled }: { value: 'VENTA' | 'DONACION'; onChange: (value: 'VENTA' | 'DONACION') => void; disabled: boolean }) {
  return <View style={publicationUI.row}>{(['VENTA', 'DONACION'] as const).map(mode => {
    const Icon = mode === 'VENTA' ? Tag : Gift, selected = mode === value;
    return <Pressable key={mode} accessibilityRole="radio" accessibilityLabel={mode === 'VENTA' ? 'Venta' : 'Donación'}
      accessibilityState={{ checked: selected, disabled }} aria-checked={selected} disabled={disabled} onPress={() => onChange(mode)}
      style={[publicationUI.modality, selected && publicationUI.selected, disabled && publicationUI.disabled]}>
      <Icon size={20} color={c.primary} /><Text style={publicationUI.actionText}>{mode === 'VENTA' ? 'Venta' : 'Donación'}</Text>
      <Text style={publicationUI.hint}>{mode === 'VENTA' ? 'Con precio' : 'Sin costo'}</Text>
    </Pressable>;
  })}</View>;
}

export function PublicationUpload({ label, hint, onPress, disabled, busy }: { label: string; hint: string; onPress: () => void; disabled: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={[publicationUI.upload, disabled && publicationUI.disabled]}>
    {busy ? <ActivityIndicator color={c.primary} /> : <UploadCloud size={28} color={c.secondary} />}
    <Text style={publicationUI.actionText}>{busy ? 'Abriendo selector…' : label}</Text><Text style={[publicationUI.hint, { textAlign: 'center' }]}>{hint}</Text>
  </Pressable>;
}

export function PublicationFeedback({ error, notice }: { error?: string | null; notice?: string | null }) {
  return <>{Boolean(notice) && <Text accessibilityLiveRegion="polite" style={publicationUI.notice}>{notice}</Text>}
    {Boolean(error) && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={publicationUI.error}>{error}</Text>}</>;
}

export function PublicationSubmit({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress}
    style={[publicationUI.submit, disabled && publicationUI.disabled]}>{busy && <ActivityIndicator color="#FFFFFF" />}
    <Text style={publicationUI.submitText}>{label}</Text></Pressable>;
}

export const publicationUI = StyleSheet.create({
  form: { gap: 16 }, section: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 18, gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, number: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: c.primary, fontWeight: '700', fontSize: 13 }, title: { color: c.ink, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  label: { color: c.ink, fontSize: 14, fontWeight: '600' }, hint: { color: c.muted, fontSize: 13, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: c.inputBorder, borderRadius: 12, minHeight: 48, padding: 13, color: c.ink, fontSize: 15, backgroundColor: '#FCFDFE' },
  textarea: { minHeight: 112, textAlignVertical: 'top' }, field: { gap: 7 }, row: { flexDirection: 'row', gap: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: c.inputBorder, padding: 12, borderRadius: 12 },
  modality: { flex: 1, minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: c.inputBorder, borderRadius: 14, padding: 12 },
  selected: { backgroundColor: c.tint, borderColor: c.primary }, actionText: { color: c.primary, fontSize: 14, fontWeight: '700' },
  upload: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.secondary, backgroundColor: '#F7FAFC', borderRadius: 14, minHeight: 136, padding: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  submit: { backgroundColor: c.primary, minHeight: 52, borderRadius: 14, padding: 15, gap: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }, secondary: { minHeight: 44, padding: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.inputBorder, borderRadius: 12 },
  disabled: { opacity: 0.5 }, error: { color: '#9D302A', backgroundColor: '#FFF0EE', padding: 14, borderRadius: 12, fontSize: 14, lineHeight: 21 },
  notice: { color: c.primary, backgroundColor: c.tint, padding: 14, borderRadius: 12, fontSize: 14, lineHeight: 21 },
});
