import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, Circle, RefreshCw } from 'lucide-react-native';
import { CATALOG_COLORS as colors, StatusTag, ui } from './CatalogUI';
import { detailUI } from './ResourceDetailUI';
import { RequestButton, requestStatusLabel, requestUI } from './RequestsUI';
import type { TransactionAction, TransactionConfirmation, TransactionParticipant } from '../types/transaction';

export const transactionDate = (date: string) => new Date(date).toLocaleString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const participantConfirmation = (participant: TransactionParticipant, confirmations: TransactionConfirmation[]) => confirmations.find(row => row.userId === participant.id && row.role === participant.role);

export function TransactionHeader({ digital = false, disabled, onBack, onReload }: { digital?: boolean; disabled: boolean; onBack: () => void; onReload: () => void }) {
  return <View style={transactionUI.inline}><Pressable accessibilityRole="button" accessibilityLabel="Volver al historial de acuerdos" disabled={disabled} onPress={onBack} style={ui.back}><ArrowLeft size={19} color={colors.primary} /><Text style={ui.link}>Volver</Text></Pressable>
    <Text style={[detailUI.helper, { flex: 1 }]}>{digital ? 'Acuerdo digital' : 'Transacción física'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Actualizar acuerdo" accessibilityState={{ disabled }} disabled={disabled} onPress={onReload} style={[ui.iconButton, disabled && ui.disabled]}><RefreshCw size={19} color={colors.primary} /></Pressable>
  </View>;
}

export function TransactionFeedback({ loading, error, onRetry, disabled = false, retryLabel = 'Reintentar consulta del acuerdo', loadingLabel = 'Cargando acuerdo', compact = false }: { loading: boolean; error?: string | null; onRetry: () => void; disabled?: boolean; retryLabel?: string; loadingLabel?: string; compact?: boolean }) {
  return <>{error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{error}</Text><RequestButton label={retryLabel} onPress={onRetry} disabled={disabled || loading} /></View>}
    {loading && <View accessibilityRole="progressbar" accessibilityLabel={loadingLabel} style={{ gap: 14 }}>{(compact ? [52, 74] : [100, 150, 120]).map((height, index) => <View key={index} style={{ height, backgroundColor: colors.border, borderRadius: 16 }} />)}</View>}
  </>;
}

export function TransactionSummary({ title, status, modality, amount, currency, campus, resourceStatus, startedAt, completedAt, cancelledAt }: {
  title: string; status: string; modality: string; amount: number | null; currency: string; campus?: string; resourceStatus?: string; startedAt: string; completedAt: string | null; cancelledAt: string | null;
}) {
  return <View style={detailUI.card}><Text accessibilityRole="header" style={transactionUI.title}>{title}</Text>
    <View style={transactionUI.inline}><StatusTag neutral={['COMPLETADA', 'CANCELADA'].includes(status)}>{requestStatusLabel(status)}</StatusTag>{campus && <Text style={detailUI.helper}>{campus}</Text>}</View>
    {resourceStatus && <Text style={detailUI.helper}>Recurso: {requestStatusLabel(resourceStatus)}</Text>}
    <Text style={transactionUI.amount}>{modality === 'DONACION' ? 'Acuerdo de donación' : `$${amount?.toLocaleString('es-CL')} ${currency}`}</Text>
    <Text style={detailUI.helper}>Condiciones originales del acuerdo</Text><Text style={detailUI.helper}>Iniciado: {transactionDate(startedAt)}</Text>
    {completedAt && <Text style={detailUI.helper}>Completado: {transactionDate(completedAt)}</Text>}
    {cancelledAt && <Text style={detailUI.helper}>Cancelado: {transactionDate(cancelledAt)}</Text>}
  </View>;
}

export function TransactionProgress({ digital = false, status, coordinated = false, confirmedCount }: { digital?: boolean; status: string; coordinated?: boolean; confirmedCount: number }) {
  const completed = status === 'COMPLETADA', cancelled = status === 'CANCELADA';
  const coordinationDone = coordinated || confirmedCount > 0 || completed;
  const steps = [{ label: 'Solicitud aceptada', done: true, current: false }, ...(!digital ? [{ label: 'Coordinar entrega', done: coordinationDone, current: !cancelled && !coordinationDone }] : []),
    { label: 'Ambos confirman', done: completed, current: !completed && !cancelled && (digital || coordinationDone) }];
  return <View style={detailUI.card}><Text style={ui.sectionTitle}>Progreso del acuerdo</Text>{steps.map((step, index) => <View key={step.label} style={transactionUI.inline}>
    <View style={[transactionUI.step, step.done && transactionUI.stepDone]}>{step.done ? <Check size={14} color="#FFFFFF" /> : <Text style={[detailUI.helper, { color: colors.primary, fontWeight: '700' }]}>{index + 1}</Text>}</View>
    <View style={{ flex: 1 }}><Text style={[detailUI.body, step.current && { fontWeight: '700' }]}>{step.label}</Text><Text style={detailUI.helper}>{step.done ? 'Completado' : cancelled ? 'Sin completar' : step.current ? 'En curso' : 'Pendiente'}</Text></View>
  </View>)}{cancelled && <Text style={detailUI.helper}>El acuerdo fue cancelado. Su historial se conserva.</Text>}</View>;
}

export function TransactionConfirmations({ participants, confirmations, currentUserId }: { participants: TransactionParticipant[]; confirmations: TransactionConfirmation[]; currentUserId?: string }) {
  const count = participants.filter(row => participantConfirmation(row, confirmations)).length;
  return <View style={detailUI.card}><Text style={ui.sectionTitle}>Confirmaciones · {count} de 2</Text>
    {participants.map(row => { const confirmation = participantConfirmation(row, confirmations); return <View key={row.role} style={transactionUI.confirmation}>
      {confirmation ? <Check size={18} color={colors.primary} /> : <Circle size={18} color={colors.muted} />}
      <View style={{ flex: 1, gap: 3 }}><Text style={detailUI.body}>{row.name}{row.id === currentUserId ? ' · Tú' : ''}</Text>
        <Text style={detailUI.helper}>{confirmation ? `Confirmó: ${transactionDate(confirmation.confirmedAt)}` : 'Confirmación pendiente'}</Text></View>
    </View>; })}
  </View>;
}

export function TransactionActions({ canConfirm, canCancel, mineConfirmed, status, digital = false, readOnly = false, disabled, onSelect }: {
  canConfirm: boolean; canCancel: boolean; mineConfirmed: boolean; status: string; digital?: boolean; readOnly?: boolean; disabled: boolean; onSelect: (action: TransactionAction) => void;
}) {
  const completed = status === 'COMPLETADA', cancelled = status === 'CANCELADA';
  return <View style={detailUI.card}><Text accessibilityLiveRegion="polite" style={ui.sectionTitle}>{completed ? 'Acuerdo completado' : cancelled ? 'Acuerdo cancelado' : readOnly ? 'Consulta histórica' : mineConfirmed ? 'Esperando a la otra parte' : 'Confirma tu parte del acuerdo'}</Text>
    <Text style={detailUI.helper}>{completed ? digital ? 'El acceso del receptor quedó registrado. El material se encuentra en Adquiridos.' : 'Ambas partes confirmaron el intercambio.'
      : cancelled ? digital ? 'Este acuerdo no concede acceso al archivo completo. Los demás acuerdos no cambian.' : 'Puedes consultar las condiciones y los mensajes de este intercambio en el historial.'
        : readOnly ? 'Las acciones del acuerdo solo están disponibles en su campus de origen.' : mineConfirmed ? 'Tu confirmación ya está registrada. El acuerdo se completa cuando ambas partes confirman.' : digital ? 'Una sola confirmación no habilita el archivo completo.' : 'Confirma cuando el intercambio se haya realizado. Una sola confirmación no finaliza la transacción.'}</Text>
    {!readOnly && canConfirm && <RequestButton label={digital ? 'Confirmar acuerdo' : 'Confirmar que se realizó'} onPress={() => onSelect('confirm')} disabled={disabled} primary />}
    {!readOnly && canCancel && <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={() => onSelect('cancel')} style={[transactionUI.dangerButton, disabled && ui.disabled]}><Text style={transactionUI.dangerText}>{digital ? 'Cancelar acuerdo' : 'Cancelar transacción'}</Text></Pressable>}
  </View>;
}

export function TransactionDecisionDialog({ action, title, description, disabled, onConfirm, onCancel }: {
  action: TransactionAction | null; title: string; description: string; disabled: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <Modal visible={Boolean(action)} transparent animationType="fade" onRequestClose={() => { if (!disabled) onCancel(); }}><View style={requestUI.overlay}>
    <ScrollView contentContainerStyle={requestUI.dialogScroll} keyboardShouldPersistTaps="handled"><View accessibilityViewIsModal style={requestUI.dialog}>
      <Text accessibilityRole="header" style={ui.sectionTitle}>{action === 'cancel' ? 'Cancelar este acuerdo' : 'Confirmar mi participación'}</Text><Text style={detailUI.body}>{title}</Text><Text style={detailUI.helper}>{description}</Text>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={onConfirm} style={[ui.primary, action === 'cancel' && { backgroundColor: '#9D302A' }, disabled && ui.disabled]}><Text style={ui.primaryText}>{action === 'cancel' ? 'Confirmar cancelación' : 'Registrar mi confirmación'}</Text></Pressable>
      <RequestButton label="Volver sin cambios" onPress={onCancel} disabled={disabled} />
    </View></ScrollView></View></Modal>;
}

export const transactionUI = StyleSheet.create({
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 50, gap: 18 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, title: { color: colors.ink, fontSize: 23, lineHeight: 30, fontWeight: '800' },
  amount: { color: colors.primary, fontSize: 18, lineHeight: 26, fontWeight: '700' }, step: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }, stepDone: { borderColor: colors.primary, backgroundColor: colors.primary },
  confirmation: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, dangerButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 10 }, dangerText: { color: '#9D302A', fontSize: 14, fontWeight: '600' },
});
