import { useEffect, useState } from 'react';
import { OwnerRating } from '../../components/OwnerRating';
import { Text, View } from 'react-native';
import { AgreementNotice, detailUI } from '../../components/ResourceDetailUI';
import { RequestButton } from '../../components/RequestsUI';
import { participantConfirmation, TransactionActions, TransactionConfirmations, TransactionDecisionDialog, TransactionFeedback, TransactionHeader, TransactionProgress, TransactionSummary } from '../../components/TransactionUI';
import type { useDigitalTradeCenter } from '../hooks/useDigitalTrades';

type Center = ReturnType<typeof useDigitalTradeCenter>;
export function DigitalTransactionDetail({ state, onReport, onAcquired }: { state: Center; onReport: () => void; onAcquired?: (publicationId: string) => void }) {
  const trade = state.trade;
  const [ratingConfirmation, setRatingConfirmation] = useState(false);
  useEffect(() => { setRatingConfirmation(false); }, [trade?.id, trade?.rating?.id, state.loading]);
  const participants = trade ? [{ id: trade.ownerId, role: 'PROPIETARIO', name: 'Propietario' }, { id: trade.receiverId, role: 'RECEPTOR', name: 'Receptor' }] : [];
  const confirmed = participants.filter(row => participantConfirmation(row, trade?.confirmations ?? []));
  const disabled = state.busy || state.loading || Boolean(state.action) || Boolean(state.error);
  return <View style={{ gap: 18 }}>
    <TransactionHeader digital onBack={state.closeTrade} onReload={state.reload} disabled={state.busy || Boolean(state.action)} />
    <TransactionFeedback loading={state.loading} error={state.error} onRetry={state.reload} disabled={state.busy} />
    {state.busy && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>Guardando cambios del acuerdo…</Text>}
    {!state.loading && trade && <>
      <TransactionSummary title={trade.title} status={trade.status} modality={trade.modality} amount={trade.amount} currency={trade.currency} startedAt={trade.startedAt} completedAt={trade.completedAt} cancelledAt={trade.cancelledAt} />
      <TransactionProgress digital status={trade.status} confirmedCount={confirmed.length} />
      <TransactionConfirmations participants={participants} confirmations={trade.confirmations} currentUserId={state.viewerId} />
      <TransactionActions digital status={trade.status} canConfirm={trade.canConfirm} canCancel={trade.canCancel} mineConfirmed={confirmed.some(row => row.id === state.viewerId)} disabled={disabled} onSelect={state.selectTransition} />
      {trade.status === 'COMPLETADA' && trade.receiverId === state.viewerId && onAcquired && <RequestButton label="Abrir en Adquiridos" onPress={() => onAcquired(trade.publicationId)} disabled={state.busy} primary />}
      {trade.status === 'COMPLETADA' && (trade.rating || trade.canRate) && <OwnerRating rating={trade.rating} canRate={trade.canRate && trade.receiverId === state.viewerId}
        score={state.score || null} confirming={ratingConfirmation} disabled={disabled} onSelect={state.setScore}
        error={state.error} busy={state.busy} onReload={state.reload}
        onPrepare={() => setRatingConfirmation(true)} onCancel={() => setRatingConfirmation(false)} onSend={() => { setRatingConfirmation(false); void state.rate(); }} />}
      <AgreementNotice />
      <RequestButton label="Denunciar acuerdo digital" onPress={onReport} disabled={state.busy || Boolean(state.action)} />
    </>}
    <TransactionDecisionDialog action={state.action} title={trade?.title ?? state.tradeTarget?.title ?? 'Acuerdo digital'} disabled={state.busy || state.loading}
      description={state.action === 'cancel' ? 'Se cancelará este acuerdo sin conceder acceso al archivo completo. Los demás acuerdos y la publicación no cambian. Su historial se conservará.' : 'Se registrará tu confirmación. El archivo completo solo se habilita cuando ambas partes confirman y se registra el derecho de acceso.'}
      onConfirm={() => { void state.transition(); }} onCancel={state.cancelTransition} />
  </View>;
}
