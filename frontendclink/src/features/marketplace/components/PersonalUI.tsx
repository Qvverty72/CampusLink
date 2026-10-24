import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, FileText, Inbox, Package } from 'lucide-react-native';
import { Skeleton, SkeletonBlock } from '@/components/Skeleton';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';

export const personalStatusLabel = (status: string) => ({
  PENDIENTE: 'Pendiente', ACEPTADA: 'Aceptada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
  RESERVADA: 'Acuerdo iniciado', PENDIENTE_CONFIRMACION: 'Esperando confirmación', COMPLETADA: 'Completada',
  DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', FINALIZADO: 'Finalizado',
  RETIRADA: 'Retirada', DESACTIVADA: 'Desactivada', ADQUIRIDO: 'Ya lo tienes', OCULTO: 'Oculta', CANCELADO: 'Cancelada',
}[status] ?? status.toLowerCase().replaceAll('_', ' '));

// Colores semánticos ya utilizados por los avisos de formularios y acuerdos del proyecto.
export function PersonalStatus({ status }: { status: string }) {
  const tone = ['COMPLETADA', 'FINALIZADO', 'ADQUIRIDO'].includes(status) ? styles.success
    : ['RECHAZADA', 'CANCELADA', 'CANCELADO'].includes(status) ? styles.danger
      : ['PENDIENTE', 'PENDIENTE_CONFIRMACION'].includes(status) ? styles.pending
        : ['ACEPTADA', 'RESERVADA', 'RESERVADO', 'DISPONIBLE'].includes(status) ? styles.info : styles.neutral;
  return <View style={[styles.status, { backgroundColor: tone.backgroundColor }]}>
    <Text style={[styles.statusText, { color: tone.color }]}>{personalStatusLabel(status)}</Text>
  </View>;
}

/** Misma anatomía para publicaciones, adquisiciones, solicitudes y transacciones. */
export function PersonalRow({ title, digital = false, helper, keyData, status, role, children }: {
  title: string; digital?: boolean; helper?: string; keyData?: string; status: string; role?: string; children?: ReactNode;
}) {
  const Icon = digital ? FileText : Package;
  return <View style={styles.row}>
    <View style={styles.icon}><Icon size={21} color={colors.secondary} /></View>
    <View style={styles.body}>
      <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {keyData && <Text style={styles.keyData}>{keyData}</Text>}</View>
      {helper && <Text style={styles.helper}>{helper}</Text>}
      <View style={styles.states}><PersonalStatus status={status} />{role && <Text style={styles.helper}>{role}</Text>}</View>
      {children}
    </View>
  </View>;
}

export function PersonalAction({ label, accessibilityLabel = label, onPress, disabled = false }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.action, disabled && ui.disabled]}>
    <Text style={styles.actionText}>{label}</Text><ChevronRight size={15} color={colors.primary} />
  </Pressable>;
}

export function PersonalEmpty({ title, helper, action, onAction, disabled = false }: {
  title: string; helper: string; action: string; onAction: () => void; disabled?: boolean;
}) {
  return <View style={styles.empty}>
    <View style={styles.emptyIcon}><Inbox size={25} color={colors.secondary} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={[styles.helper, { textAlign: 'center' }]}>{helper}</Text>
    <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={onAction} style={[ui.outlined, disabled && ui.disabled]}>
      <Text style={ui.link}>{action}</Text>
    </Pressable>
  </View>;
}

export function PersonalSkeleton({ label = 'Cargando actividad' }: { label?: string }) {
  return <Skeleton label={label} contentStyle={personalUI.list}>{[0, 1, 2].map(index => <View key={index} style={styles.row}>
    <SkeletonBlock style={ui.skeletonBlock} width={40} height={44} borderRadius={10} />
    <View style={styles.body}><SkeletonBlock style={ui.skeletonBlock} width="90%" height={17} />
      <SkeletonBlock style={ui.skeletonBlock} width="65%" height={13} />
      <SkeletonBlock style={ui.skeletonBlock} width={88} height={21} borderRadius={12} /></View>
  </View>)}</Skeleton>;
}

export const personalUI = StyleSheet.create({ list: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' } });
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  icon: { width: 40, height: 44, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 6 }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  keyData: { maxWidth: '45%', color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 }, states: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  status: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '100%' },
  statusText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  success: { color: '#17613F', backgroundColor: '#E5F3EB' }, danger: { color: '#9D302A', backgroundColor: '#FFF0EE' },
  pending: { color: '#805C0A', backgroundColor: '#FFF4D9' }, info: { color: colors.primary, backgroundColor: colors.tint },
  neutral: { color: colors.muted, backgroundColor: colors.background },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  actionText: { color: colors.primary, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 32, gap: 10 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint, marginBottom: 4 },
  emptyTitle: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
});
