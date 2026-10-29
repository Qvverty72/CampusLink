import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AgreementStepModal } from '../../components/AgreementStepModal';
import { AgreementPanelSkeleton } from '../../components/AgreementUI';
import { RequestButton } from '../../components/RequestsUI';
import { CATALOG_COLORS as colors, ui } from '../../components/CatalogUI';
import { useAgreementPolling } from '../../hooks/useAgreementPolling';
import { useDigitalMessages } from '../hooks/useDigitalMessages';
import type { DigitalTrade } from '../types/trade';

export function DigitalTransactionChat({ initial, onClose, onSnapshot, active = true }: { initial: DigitalTrade; onClose: () => void; onSnapshot?: (trade: DigitalTrade) => void; active?: boolean }) {
  const state = useDigitalMessages(initial, onSnapshot), { identity } = useAuth();
  useAgreementPolling(state.poll, active && state.verified && state.active && !state.busy && !state.loading, 7000);
  const composer = state.verified && state.active ? <View style={{ gap: 8 }}>
    <TextInput accessibilityLabel="Escribe un mensaje" placeholder="Escribe un mensaje…" value={state.draft} onChangeText={state.setDraft}
      multiline maxLength={2000} editable={!state.busy} style={styles.input} textAlignVertical="top" />
    <View style={styles.composerActions}><Text style={ui.subtitle}>{state.draft.length}/2000</Text>
      <RequestButton label={state.busy ? 'Enviando…' : 'Enviar mensaje'} primary disabled={state.busy || state.loading || !state.draft.trim()} onPress={() => void state.send()} /></View>
    {state.sendError && <Text accessibilityRole="alert" style={styles.error}>{state.sendError}</Text>}
  </View> : undefined;
  return <AgreementStepModal title={`Chat de ${state.trade.title}`} closeLabel="Cerrar chat" onClose={onClose} closeDisabled={state.busy}
    fillHeight keyboardAvoiding footer={composer} refresh={{ onRefresh: state.refresh, refreshing: state.loading, enabled: !state.busy, label: 'la conversación' }}>
    <Text style={ui.subtitle}>Conversa con la otra persona para coordinar esta transacción.</Text>
    {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
    {!state.verified && state.loading ? <AgreementPanelSkeleton digital panel="coordinate" /> : <>
      {!state.active && <Text style={ui.subtitle}>La transacción está cerrada. Se conserva la conversación para consulta.</Text>}
      {state.verified && !state.messages.length && <Text style={ui.subtitle}>Aún no hay mensajes. Puedes iniciar la conversación.</Text>}
      {state.verified && [...state.messages].reverse().map(message => {
        const mine = message.senderId === identity?.userId;
        const name = mine ? 'Tú' : state.trade.participants?.find(person => person.id === message.senderId)?.name ?? 'La otra persona';
        return <View key={message.id} style={[styles.message, mine ? styles.mine : styles.other]}>
          <Text style={styles.name}>{name}</Text><Text selectable style={styles.text}>{message.text}</Text>
          <Text style={styles.date}>{new Date(message.createdAt).toLocaleString('es-CL')}</Text>
        </View>;
      })}
      {state.verified && (state.page > 1 || state.meta?.hasMore) && <View style={styles.pages}>
        <RequestButton label="Más recientes" disabled={state.busy || state.loading || state.page === 1} onPress={() => void state.changePage(state.page - 1)} />
        <RequestButton label="Mensajes anteriores" disabled={state.busy || state.loading || !state.meta?.hasMore} onPress={() => void state.changePage(state.page + 1)} />
      </View>}
    </>}
  </AgreementStepModal>;
}
const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, minHeight: 64, maxHeight: 130, color: colors.ink, backgroundColor: colors.surface },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  message: { maxWidth: '92%', borderRadius: 14, padding: 12, gap: 6 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#E5F1FA' }, other: { alignSelf: 'flex-start', backgroundColor: '#F1F3F5' },
  name: { fontWeight: '700', color: colors.primary, fontSize: 13 }, text: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  date: { color: colors.muted, fontSize: 11 }, error: { color: '#B91C1C' }, pages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
});
