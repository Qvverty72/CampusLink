import type { ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATALOG_COLORS as colors, ui } from './CatalogUI';
import { detailUI } from './ResourceDetailUI';
import { PersonalAction, PersonalEmpty, PersonalRow, PersonalSkeleton, personalStatusLabel, personalUI } from './PersonalUI';

export const requestStatusLabel = personalStatusLabel;

export function RequestButton({ label, accessibilityLabel = label, onPress, disabled = false, primary = false, variant = 'button' }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean; variant?: 'button' | 'text';
}) {
  if (variant === 'text') return <PersonalAction label={label} accessibilityLabel={accessibilityLabel} onPress={onPress} disabled={disabled} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[primary ? ui.primary : ui.outlined, disabled && ui.disabled]}>
    <Text style={primary ? ui.primaryText : ui.link}>{label}</Text>
  </Pressable>;
}

export function RequestsHeader({ received, helper, busy, compact = false }: {
  received: boolean; helper: string; loading: boolean; busy: boolean; onReload: () => void; compact?: boolean;
}) {
  return <View style={{ gap: 8 }}><View style={requestUI.header}>
    <View style={{ flex: 1, gap: 4 }}>{!compact && <Text accessibilityRole="header" style={requestUI.title}>{received ? 'Solicitudes recibidas' : 'Mis solicitudes'}</Text>}<Text style={detailUI.helper}>{helper}</Text></View>
  </View>
    {busy && <View accessibilityLiveRegion="polite" style={requestUI.inline}><ActivityIndicator size="small" color={colors.primary} /><Text style={detailUI.helper}>Guardando decisión…</Text></View>}
  </View>;
}

export function RequestsFeedback({ loading, error, empty, received, onReload, disabled = false }: {
  loading: boolean; error: string | null; empty: boolean; received: boolean; onReload: () => void; disabled?: boolean;
}) {
  return <>
    {error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{error}</Text>
      <RequestButton label="Reintentar consulta" onPress={onReload} disabled={disabled || loading} /></View>}
    {loading ? <PersonalSkeleton label="Cargando solicitudes" /> : !error && empty && <PersonalEmpty
      title={received ? 'Aún no hay solicitudes recibidas' : 'No hay solicitudes en esta página'}
      helper={received ? 'Cuando alguien se interese en tus recursos, podrás responder desde aquí.' : 'Las solicitudes que envíes y sus acuerdos aparecerán aquí, junto con su historial.'}
      action="Actualizar solicitudes" onAction={onReload} disabled={disabled} />}
  </>;
}

export function RequestCard({ title, requester, status, requestedAt, message, digital = false, keyData, children }: {
  title: string; requester?: string; status: string; requestedAt: string; message: string; historical?: boolean; digital?: boolean; keyData?: string; children?: ReactNode;
}) {
  return <PersonalRow title={title} digital={digital} keyData={keyData} status={status}
    helper={`${requester ? `De ${requester}` : 'Solicitud enviada'} · ${new Date(requestedAt).toLocaleDateString('es-CL')}`}>
    <Text style={detailUI.helper}>{message}</Text>
    {children}
  </PersonalRow>;
}

export function RequestsPager({ page, hasMore, disabled, onPrevious, onNext, itemLabel = 'Solicitudes' }: {
  page: number; hasMore: boolean; disabled: boolean; onPrevious: () => void; onNext: () => void; itemLabel?: string;
}) {
  if (page === 1 && !hasMore) return null;
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
  list: personalUI.list,
  section: { gap: 14 }, title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 }, inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' }, resource: { color: colors.primary, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  message: { padding: 12, backgroundColor: colors.background, borderRadius: 10 },
  empty: { alignItems: 'center', borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, padding: 24, gap: 12 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0, 20, 38, 0.45)' }, dialogScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 22, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 16 },
});
