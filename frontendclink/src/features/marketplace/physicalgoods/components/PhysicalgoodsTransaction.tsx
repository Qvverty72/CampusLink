import { useAgreementPolling } from '../../hooks/useAgreementPolling';
import { OwnerRating } from '../../components/OwnerRating';
import { Modal, Text, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
import { usePhysicalgoodsTransaction } from '../hooks/usePhysicalgoodsTransaction';
import type { PhysicalgoodsTransactionTarget } from '../types/publication';
import { AgreementNotice, detailUI } from '../../components/ResourceDetailUI';
import { ui } from '../../components/CatalogUI';
import { RequestButton } from '../../components/RequestsUI';
import { participantConfirmation, TransactionActions, TransactionConfirmations, TransactionDecisionDialog, TransactionFeedback, TransactionHeader, TransactionProgress, TransactionSummary, transactionUI } from '../../components/TransactionUI';
import { PhysicalgoodsCoordination, PhysicalgoodsCoordinationMessages } from './PhysicalgoodsCoordination';

/** Acuerdo autorizado; la ubicación nunca es un requisito para confirmar. */
export function PhysicalgoodsTransaction({ target, onClose, onChanged, refreshEnabled = true }: { target: PhysicalgoodsTransactionTarget; onClose: () => void; onChanged: () => void; refreshEnabled?: boolean }) {
  const t = usePhysicalgoodsTransaction(target, onChanged), detail = t.detail, insets = useSafeAreaInsets();
  const [reporting, setReporting] = useState(false), [reportBusy, setReportBusy] = useState(false);
  const close = () => { if (!t.busy && !reportBusy) { if (reporting) setReporting(false); else onClose(); } };
  const participants = detail ? [{ id: detail.owner.id, name: detail.owner.fullName, role: 'PROPIETARIO' }, { id: detail.receiver.id, name: detail.receiver.fullName, role: 'RECEPTOR' }] : [];
  const currentUserId = detail?.role === 'PROPIETARIO' ? detail.owner.id : detail?.receiver.id;
  const confirmed = participants.filter(row => participantConfirmation(row, detail?.confirmations ?? []));
  const cancellationMessage = detail?.publication.isWithdrawn ? 'Se cancelará el acuerdo y se conservará su historial. La publicación seguirá retirada.'
    : ['OCULTO', 'CANCELADO'].includes(detail?.publication.status ?? '') ? 'Se conservará el historial. La publicación seguirá fuera del marketplace.'
      : 'El recurso volverá a estar disponible. Las otras solicitudes seguirán pendientes y podrán resolverse. Este acuerdo quedará en el historial.';
  const refreshing = t.loading || t.messagesLoading || t.optionsLoading;
  useAgreementPolling(t.poll, refreshEnabled && !refreshing && !t.busy && !reporting && !reportBusy && !t.action && !t.ratingConfirmation && !t.error && Boolean(detail && ['RESERVADA', 'PENDIENTE_CONFIRMACION'].includes(detail.status)));
  return <Modal visible onRequestClose={close} animationType="slide"><RefreshScrollView refreshIndicatorOffset={insets.top + 8} style={detailUI.page} contentContainerStyle={[transactionUI.content, { paddingTop: Math.max(20, insets.top + 8), paddingBottom: Math.max(40, insets.bottom + 20) }]} keyboardShouldPersistTaps="handled"
    onRefresh={t.reload} refreshing={refreshing} refreshEnabled={refreshEnabled && !refreshing && !t.busy && !reporting && !reportBusy && !t.action && !t.ratingConfirmation && !detail?.canRate} refreshLabel="el acuerdo">
    <TransactionHeader onBack={close} onReload={t.reload} disabled={t.busy || reportBusy || Boolean(t.action)} />
    {reporting ? <MarketplaceReportForm target={{ type: 'TRANSACCION', ...target }} title={detail?.publication.title ?? 'Acuerdo del recurso'} onBusyChange={setReportBusy} onBack={() => { setReporting(false); t.reload(); }} /> : <>
      <TransactionFeedback loading={t.loading} error={t.error} onRetry={t.reload} disabled={t.busy} />
      {t.busy && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>Guardando cambios del acuerdo…</Text>}
      {!t.loading && detail && <>
        <TransactionSummary title={detail.publication.title} status={detail.status} modality={detail.modality} amount={detail.amount} currency={detail.currency} campus={detail.campus.name} resourceStatus={detail.publication.status} startedAt={detail.startedAt} completedAt={detail.completedAt} cancelledAt={detail.cancelledAt} />
        {detail.publication.isWithdrawn && <Text style={detailUI.helper}>La publicación fue retirada. Se conserva este acuerdo.</Text>}
        {t.historical && <View style={detailUI.notice}><Text style={detailUI.noticeText}>Consulta histórica de otro campus. Puedes revisar el acuerdo y sus mensajes.</Text></View>}
        {detail.cancelledById && <Text style={detailUI.helper}>Cancelado por {participants.find(row => row.id === detail.cancelledById)?.name ?? 'un participante'}.</Text>}
        <TransactionProgress status={detail.status} confirmedCount={confirmed.length} coordinated={Boolean(t.messages?.data.length)} />
        {detail.canCancel && !t.historical && <PhysicalgoodsCoordination state={t} />}
        <TransactionConfirmations participants={participants} confirmations={detail.confirmations} currentUserId={currentUserId} />
        <TransactionActions readOnly={t.historical} canConfirm={detail.canConfirm} canCancel={detail.canCancel} mineConfirmed={confirmed.some(row => row.id === currentUserId)} status={detail.status} disabled={t.busy || Boolean(t.action)} onSelect={t.selectAction} />
        <PhysicalgoodsCoordinationMessages state={t} />
        <PhysicalgoodsTransactionRating state={t} />
        <AgreementNotice />
        {!t.historical && <RequestButton label="Denunciar transacción" onPress={() => setReporting(true)} disabled={t.busy} />}
      </>}
    </>}
    <TransactionDecisionDialog action={t.action} title={detail?.publication.title ?? 'Acuerdo del recurso'} description={t.action === 'cancel' ? cancellationMessage : 'Se registrará tu confirmación. El acuerdo solo se completa cuando ambas partes confirman.'}
      disabled={t.busy || t.loading} onConfirm={() => { void (t.action === 'cancel' ? t.cancel() : t.confirm()); }} onCancel={t.cancelAction} />
  </RefreshScrollView></Modal>;
}

function PhysicalgoodsTransactionRating({ state: t }: { state: ReturnType<typeof usePhysicalgoodsTransaction> }) {
  const detail = t.detail;
  if (!detail || detail.status !== 'COMPLETADA') return null;
  return <OwnerRating owner={detail.owner.fullName} rating={detail.rating} canRate={detail.canRate && detail.role === 'RECEPTOR'}
    score={t.ratingScore} confirming={t.ratingConfirmation} disabled={t.busy || t.loading || Boolean(t.error)}
    error={t.error} busy={t.busy} onReload={t.reload}
    onSelect={t.selectRating} onPrepare={t.confirmRating} onSend={() => { void t.rate(); }} onCancel={t.cancelRating} />;
}
