import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Inbox, RefreshCw, UserRound } from 'lucide-react-native';
import { CATALOG_COLORS as colors, StatusTag, ui } from './CatalogUI';
import { detailUI } from './ResourceDetailUI';

export const requestStatusLabel = (status: string) => ({
  PENDIENTE: 'Pendiente', ACEPTADA: 'Aceptada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
  RESERVADA: 'Acuerdo iniciado', PENDIENTE_CONFIRMACION: 'Esperando confirmación', COMPLETADA: 'Completada',
  DISPONIBLE: 'Disponible', RESERVADO: 'Reservado', FINALIZADO: 'Finalizado',
  RETIRADA: 'Retirada', DESACTIVADA: 'Desactivada', ADQUIRIDO: 'Ya lo tienes', OCULTO: 'Oculta', CANCELADO: 'Cancelada',
}[status] ?? status.toLowerCase().replaceAll('_', ' '));

export function RequestButton({ label, accessibilityLabel = label, onPress, disabled = false, primary = false }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[primary ? ui.primary : ui.outlined, disabled && ui.disabled]}>
    <Text style={primary ? ui.primaryText : ui.link}>{label}</Text>
  </Pressable>;
}

export function RequestsHeader({ received, helper, loading, busy, onReload }: {
  received: boolean; helper: string; loading: boolean; busy: boolean; onReload: () => void;
}) {
  return <View style={{ gap: 8 }}><View style={requestUI.header}>
    <Text accessibilityRole="header" style={[requestUI.title, { flex: 1 }]}>{received ? 'Solicitudes recibidas' : 'Mis solicitudes'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Actualizar solicitudes" accessibilityState={{ disabled: busy || loading }} disabled={busy || loading}
      onPress={onReload} style={[ui.iconButton, (busy || loading) && ui.disabled]}><RefreshCw size={19} color={colors.primary} /></Pressable>
  </View><Text style={detailUI.helper}>{helper}</Text>
    {busy && <View accessibilityLiveRegion="polite" style={requestUI.inline}><ActivityIndicator size="small" color={colors.primary} /><Text style={detailUI.helper}>Guardando decisión…</Text></View>}
  </View>;
}

export function RequestsFeedback({ loading, error, empty, received, onReload, disabled = false }: {
  loading: boolean; error: string | null; empty: boolean; received: boolean; onReload: () => void; disabled?: boolean;
}) {
  return <>
    {error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{error}</Text>
      <RequestButton label="Reintentar consulta" onPress={onReload} disabled={disabled || loading} /></View>}
    {loading ? <View accessibilityRole="progressbar" accessibilityLabel="Cargando solicitudes" style={{ gap: 12 }}>
      {[0, 1, 2].map(index => <View key={index} style={[detailUI.card, { gap: 14 }]}>{[85, 58, 100, 45].map((width, part) => <View key={part} style={{ height: part === 2 ? 38 : 14, width: `${width}%`, borderRadius: 8, backgroundColor: colors.border }} />)}</View>)}
    </View> : !error && empty && <View style={requestUI.empty}><Inbox size={30} color={colors.secondary} />
      <Text style={ui.sectionTitle}>{received ? 'Aún no hay solicitudes recibidas' : 'No hay solicitudes en esta página'}</Text>
      <Text style={[detailUI.helper, { textAlign: 'center' }]}>{received ? 'Cuando alguien se interese en tus recursos, podrás responder desde aquí.' : 'Las solicitudes que envíes y sus acuerdos aparecerán aquí, junto con su historial.'}</Text>
      <RequestButton label="Actualizar solicitudes" onPress={onReload} disabled={disabled} />
    </View>}
  </>;
}

export function RequestCard({ title, requester, status, requestedAt, message, historical = ['RECHAZADA', 'CANCELADA'].includes(status), children }: {
  title: string; requester?: string; status: string; requestedAt: string; message: string; historical?: boolean; children?: ReactNode;
}) {
  return <View style={[detailUI.card, historical && { backgroundColor: '#F8FAFC', borderStyle: 'dashed' }]}>
    <View style={requestUI.header}><View style={requestUI.avatar}><UserRound size={20} color={colors.primary} /></View>
      <View style={{ flex: 1, gap: 3 }}><Text accessibilityRole="header" style={requestUI.name}>{requester || title}</Text>
        <Text style={detailUI.helper}>{new Date(requestedAt).toLocaleDateString('es-CL')}</Text></View>
      <StatusTag neutral={status !== 'PENDIENTE'}>{requestStatusLabel(status)}</StatusTag>
    </View>
    {requester && <Text style={requestUI.resource}>{title}</Text>}
    <View style={requestUI.message}><Text style={detailUI.body}>{message}</Text></View>
    {children}
  </View>;
}

export function RequestsPager({ page, hasMore, disabled, onPrevious, onNext, itemLabel = 'Solicitudes' }: {
  page: number; hasMore: boolean; disabled: boolean; onPrevious: () => void; onNext: () => void; itemLabel?: string;
}) {
  return <View style={requestUI.pager}><RequestButton label="Anterior" accessibilityLabel={`${itemLabel} anteriores`} onPress={onPrevious} disabled={disabled || page === 1} />
    <Text style={detailUI.helper}>Página {page}</Text><RequestButton label="Siguiente" accessibilityLabel={`${itemLabel} siguientes`} onPress={onNext} disabled={disabled || !hasMore} />
  </View>;
}

export function RequestDecisionDialog({ selection, physical = false, disabled, onConfirm, onCancel }: {
  selection: { name: string; title: string; decision: 'ACEPTAR' | 'RECHAZAR' } | null; physical?: boolean;
  disabled: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <Modal visible={Boolean(selection)} transparent animationType="fade" onRequestClose={() => { if (!disabled) onCancel(); }}>
    <View style={requestUI.overlay}><ScrollView contentContainerStyle={requestUI.dialogScroll} keyboardShouldPersistTaps="handled">
      {selection && <View accessibilityViewIsModal style={requestUI.dialog}>
        <Text accessibilityRole="header" style={ui.sectionTitle}>{selection.decision === 'ACEPTAR' ? 'Aceptar' : 'Rechazar'} solicitud</Text>
        <Text style={detailUI.body}>{selection.name} · {selection.title}</Text>
        <Text style={detailUI.helper}>{selection.decision === 'RECHAZAR' ? 'La solicitud quedará rechazada. Su registro se conservará en el historial.' : physical
          ? 'El recurso quedará reservado para esta persona. Las demás solicitudes seguirán pendientes.'
          : 'Se iniciará un acuerdo con esta persona. El recurso seguirá disponible para otros estudiantes.'}</Text>
        <RequestButton label={selection.decision === 'ACEPTAR' ? 'Confirmar aceptación' : 'Confirmar rechazo'} onPress={onConfirm} primary disabled={disabled} />
        <RequestButton label="Volver sin cambios" onPress={onCancel} disabled={disabled} />
      </View>}
    </ScrollView></View>
  </Modal>;
}

export const requestUI = StyleSheet.create({
  section: { gap: 16, marginTop: 16 }, title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }, resource: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  message: { padding: 12, backgroundColor: colors.background, borderRadius: 10 },
  empty: { alignItems: 'center', borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, padding: 24, gap: 12 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 20, 38, 0.45)' }, dialogScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 22, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 16 },
});
