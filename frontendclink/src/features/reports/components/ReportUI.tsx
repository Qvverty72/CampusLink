import type { ComponentRef, ReactNode, Ref } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Platform, Pressable, Text, View } from 'react-native';
import { CircleCheck, CircleMinus, Clock3, FileText, Flag, Inbox, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { reportStyles as s, reportColors as c } from './reports.styles';
export type ReportFocusTarget = ComponentRef<typeof View>;
export function focusReport(target: ReportFocusTarget | null) {
  target?.focus?.();
  if (target && Platform.OS !== 'web') { const handle = findNodeHandle(target); if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle); }
}
export function ReportIcon({ icon: Icon, size = 19, color = c.SECONDARY }: { icon: LucideIcon; size?: number; color?: string }) {
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.icon}><Icon size={size} color={color} strokeWidth={1.8} /></View>;
}
export function ReportButton({ children, onPress, secondary, disabled, busy, icon, buttonRef, label }: {
  children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean; icon?: LucideIcon; buttonRef?: Ref<ReportFocusTarget>; label?: string;
}) {
  return <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={label ?? children} disabled={disabled || busy}
    accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} onPress={onPress}
    android_ripple={{ color: secondary ? '#DCE8F1' : '#3F6A8E' }} style={[s.button, secondary && s.secondaryButton, (disabled || busy) && s.disabled]}>
    {busy ? <ActivityIndicator color={secondary ? c.PRIMARY : '#FFFFFF'} /> : icon && <ReportIcon icon={icon} color={secondary ? c.PRIMARY : '#FFFFFF'} />}
    <Text style={[s.buttonText, secondary && s.secondaryText]}>{children}</Text>
  </Pressable>;
}
const states: Record<string, { label: string; color: string; backgroundColor: string; icon: LucideIcon }> = {
  PENDIENTE: { label: 'Pendiente', color: '#79500F', backgroundColor: '#FFF4D6', icon: Clock3 },
  EN_REVISION: { label: 'En revisión', color: '#245989', backgroundColor: '#EAF2FC', icon: ShieldCheck },
  RESUELTO: { label: 'Resuelta', color: '#246044', backgroundColor: '#E8F5ED', icon: CircleCheck },
  DESESTIMADO: { label: 'Desestimada', color: '#536473', backgroundColor: '#EDF1F4', icon: CircleMinus },
};
export function ReportStatusChip({ status, compact = false }: { status: string; compact?: boolean }) {
  const state = states[status] ?? { label: status || 'Estado no registrado', color: c.SECONDARY, backgroundColor: c.soft, icon: Flag };
  return <View style={[s.chip, compact && s.compactChip, { backgroundColor: state.backgroundColor }]}>{!compact && <ReportIcon icon={state.icon} size={14} color={state.color} />}<Text style={[s.chipText, compact && s.compactChipText, { color: state.color }]}>{state.label}</Text></View>;
}
export function ReportStateMessage({ title, children, error, onRetry, action = 'Reintentar', icon = Inbox }: {
  title: string; children: ReactNode; error?: boolean; onRetry?: () => void; action?: string; icon?: LucideIcon;
}) {
  return <View style={[s.card, error && s.errorBox]}><View style={s.topRow}><ReportIcon icon={error ? TriangleAlert : icon} color={error ? c.error : c.SECONDARY} size={24} />
    <View style={[s.grow, s.smallStack]}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text><Text accessibilityRole={error ? 'alert' : undefined} style={[s.body, error && s.errorText]}>{children}</Text></View></View>
    {onRetry && <ReportButton secondary onPress={onRetry}>{action}</ReportButton>}
  </View>;
}
export function ReportLoading({ detail = false }: { detail?: boolean }) {
  return <Skeleton label={detail ? 'Abriendo denuncia' : 'Cargando denuncias'} contentStyle={s.stack}>
    {Array.from({ length: detail ? 2 : 3 }, (_, index) => <View key={index} style={s.card}>
      <View style={s.between}><SkeletonBlock width="36%" height={18} /><SkeletonBlock width="26%" height={28} /></View>
      <SkeletonBlock width="85%" height={24} /><SkeletonBlock width="65%" /><SkeletonBlock height={detail ? 160 : 30} />
    </View>)}
  </Skeleton>;
}
export function ReportSection({ title, icon = FileText, children, headingRef }: { title: string; icon?: LucideIcon; children: ReactNode; headingRef?: Ref<ComponentRef<typeof Text>> }) {
  return <View style={s.card}><View style={s.row}><ReportIcon icon={icon} /><Text ref={headingRef} tabIndex={headingRef ? -1 : undefined} accessibilityRole="header" style={s.sectionTitle}>{title}</Text></View>{children}</View>;
}
