import { COORDINATION_MESSAGES_POLL_INTERVAL, useAgreementPolling } from '../../hooks/useAgreementPolling';
import { OwnerRating } from '../../components/OwnerRating';
import { Modal, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
import { usePhysicalgoodsTransaction } from '../hooks/usePhysicalgoodsTransaction';
import { usePhysicalgoodsAgreementRequest } from '../hooks/usePhysicalgoodsAgreementRequest';
import type { PhysicalgoodsTransactionTarget } from '../types/publication';
import { AgreementNotice, detailUI } from '../../components/ResourceDetailUI';
import { AgreementHeader, AgreementSummary, AgreementMenu, AgreementStepper, AgreementActionBar, type AgreementStep } from '../../components/AgreementUI';
import { agreementCopy as copy, agreementPresentation } from '../../utils/agreementPresentation';
import { TransactionConfirmations, TransactionDecisionDialog, TransactionFeedback, transactionUI } from '../../components/TransactionUI';
import { PhysicalgoodsCoordination, PhysicalgoodsCoordinationMessages } from './PhysicalgoodsCoordination';
import { PhysicalgoodsHistoryDetail } from './PhysicalgoodsHistory';
import { PhysicalgoodsAgreementProduct } from './PhysicalgoodsAgreementProduct';
import { AgreementStepModal } from '../../components/AgreementStepModal';

/** Acuerdo autorizado; ubicación y mensajes no son requisitos para confirmar. */
export function PhysicalgoodsTransaction({ target, onClose, onChanged, onOpen, refreshEnabled = true }: {
  target: PhysicalgoodsTransactionTarget; onClose: () => void; onChanged: () => void; onOpen?: (id: string) => void; refreshEnabled?: boolean;
}) {
  const t = usePhysicalgoodsTransaction(target, onChanged), insets = useSafeAreaInsets();
  const origin = usePhysicalgoodsAgreementRequest(target);
  const [reporting, setReporting] = useState(false), [reportBusy, setReportBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false), [reportPrompt, setReportPrompt] = useState(false);
  const [panel, setPanel] = useState<AgreementStep | 'overview'>('overview'), [locationSelecting, setLocationSelecting] = useState(false);
  const targetKey = `${target.publicationId}:${target.transactionId}`;
  const snapshot = useRef<{ key: string; detail: NonNullable<typeof t.detail>; historical: boolean } | null>(null);
  const currentDetail = t.detail?.id === target.transactionId && t.detail?.publication.id === target.publicationId ? t.detail : null;
  if (currentDetail) snapshot.current = { key: targetKey, detail: currentDetail, historical: t.historical };
  const detail = currentDetail ?? (panel !== 'overview' && snapshot.current?.key === targetKey ? snapshot.current.detail : null);
  const historical = currentDetail ? t.historical : snapshot.current?.key === targetKey ? snapshot.current.historical : t.historical;
  useEffect(() => { setPanel('overview'); }, [target.publicationId, target.transactionId]);
  useEffect(() => {
    if (panel !== 'coordinate') return;
    t.refreshMessages();
    return () => t.cancelMessageRefresh();
  }, [panel, target.publicationId, target.transactionId]);
  const disabled = t.busy || reportBusy || Boolean(t.action) || reportPrompt;
  const close = () => { if (!disabled) { if (reporting) setReporting(false); else onClose(); } };
  const view = detail ? agreementPresentation(detail) : null;
  const participants = detail ? [{ id: detail.owner.id, name: detail.owner.fullName, role: 'PROPIETARIO' }, { id: detail.receiver.id, name: detail.receiver.fullName, role: 'RECEPTOR' }] : [];
  const currentUserId = detail?.role === 'PROPIETARIO' ? detail.owner.id : detail?.receiver.id;
  const canOpen = Boolean(onOpen && detail && !historical && !detail.publication.isWithdrawn && ['DISPONIBLE','RESERVADO','FINALIZADO'].includes(detail.publication.status));
  const cancellationMessage = detail?.publication.isWithdrawn ? copy.cancelWithdrawn
    : ['OCULTO', 'CANCELADO'].includes(detail?.publication.status ?? '') ? copy.cancelHidden
      : copy.cancelAvailable;
  const refreshing = t.loading || t.messagesLoading || t.messagesRefreshing || t.optionsLoading;
  const interacting = disabled || menuOpen || panel === 'accepted' || locationSelecting || origin.loading || Boolean(origin.request) || reporting || Boolean(t.ratingConfirmation);
  useEffect(() => { if (interacting) t.cancelPolling?.(); }, [interacting]);
  useAgreementPolling(() => t.poll({ messages: panel !== 'coordinate' }), refreshEnabled && !refreshing && !interacting && !t.error && Boolean(view && !view.terminal));
  useAgreementPolling(t.pollMessages, panel === 'coordinate' && refreshEnabled && !refreshing && !interacting && Boolean(view && !view.terminal), COORDINATION_MESSAGES_POLL_INTERVAL, t.cancelMessagePolling);
  const closeStep = () => { if (!t.busy) { if (t.action) t.cancelAction(); else { t.cancelMessageRefresh(); setPanel('overview'); } } };
  const labels = reportPrompt ? { heading: copy.reportQuestion, confirm: copy.reportYes, back: copy.back }
    : t.action === 'cancel' ? { heading: copy.cancelQuestion, confirm: copy.cancelYes, back: copy.back } : { heading: copy.confirmQuestion, confirm: copy.confirmYes, back: copy.back };
  const decision = <TransactionDecisionDialog action={reportPrompt ? 'confirm' : t.action} labels={labels} title={detail?.publication.title ?? copy.title}
    embedded={panel === 'confirm'} description={reportPrompt ? copy.reportHelp : t.action === 'cancel' ? cancellationMessage : copy.confirmHelp} disabled={t.busy || t.loading}
    onConfirm={() => { if (reportPrompt) { setReportPrompt(false); setReporting(true); } else void (t.action === 'cancel' ? t.cancel() : t.confirm()); }} onCancel={() => { if (reportPrompt) setReportPrompt(false); else t.cancelAction(); }} />;
  return <Modal visible onRequestClose={close} animationType="slide"><View style={detailUI.page}>
    <RefreshScrollView refreshIndicatorOffset={insets.top + 8} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={[transactionUI.content, { paddingTop: Math.max(16, insets.top + 8), paddingBottom: Math.max(24, insets.bottom + 12) }]} keyboardShouldPersistTaps="handled"
      onRefresh={t.reload} refreshing={refreshing} refreshEnabled={panel === 'overview' && refreshEnabled && !refreshing && !interacting && !detail?.canRate} refreshLabel="el acuerdo">
      <AgreementHeader title={detail?.publication.title ?? copy.title} onBack={close} onMenu={() => setMenuOpen(true)} disabled={disabled} menuDisabled={reporting || t.loading || !detail} />
      {reporting ? <MarketplaceReportForm target={{ type: 'TRANSACCION', ...target }} title={detail?.publication.title ?? copy.title} onBusyChange={setReportBusy} onBack={() => { setReporting(false); t.reload(); }} /> : <>
        <TransactionFeedback loading={t.loading} error={t.error} onRetry={t.reload} disabled={t.busy} />
        {t.busy && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>{copy.saving}</Text>}
        {origin.loading && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>{copy.lookup}</Text>}
        {origin.error && <Text accessibilityRole="alert" style={detailUI.error}>{origin.error}</Text>}
        {!t.loading && detail && view && <>
          <AgreementSummary view={view} modality={detail.modality} amount={detail.amount} currency={detail.currency} campus={detail.campus.name} resourceStatus={detail.publication.status} startedAt={detail.startedAt} completedAt={detail.completedAt} cancelledAt={detail.cancelledAt} />
          <AgreementStepper state={view.state} selected={panel === 'overview' ? undefined : panel} disabled={disabled} onSelect={setPanel} />
          {panel === 'overview' && <Text style={detailUI.helper}>{copy.chooseStep}</Text>}
          <AgreementNotice />
          {detail.publication.isWithdrawn && <Text style={detailUI.helper}>{copy.withdrawn}</Text>}
          {historical && <View style={detailUI.notice}><Text style={detailUI.noticeText}>{copy.history}</Text></View>}
          {detail.cancelledById && <Text style={detailUI.helper}>{copy.cancelledBy(participants.find(row => row.id === detail.cancelledById)?.name ?? copy.participant)}</Text>}
        </>}
      </>}
    </RefreshScrollView>
    {!reporting && !t.loading && detail && panel === 'accepted' && <PhysicalgoodsAgreementProduct detail={detail} historical={historical} onClose={() => setPanel('overview')} />}
    {!reporting && detail && view && (panel === 'coordinate' || panel === 'confirm') && <AgreementStepModal title={panel === 'coordinate' ? copy.coordinationTitle(detail.publication.title) : copy.confirmStep}
      closeLabel={copy.closeStep(panel === 'coordinate' ? copy.coordinateStep : copy.confirmStep)} onClose={closeStep} closeDisabled={t.busy} fillHeight={panel === 'coordinate'}
      refresh={panel === 'coordinate' ? { onRefresh: t.refreshMessages, refreshing: t.messagesRefreshing, enabled: refreshEnabled && !disabled && !locationSelecting && !t.loading && !t.messagesLoading && !t.messagesRefreshing, label: copy.messagesRefresh } : undefined}
      overlay={panel === 'confirm' && t.action ? decision : undefined}>
      {panel === 'confirm' && <Text style={detailUI.body}>{detail.publication.title}</Text>}
      {historical && <Text style={detailUI.helper}>{copy.history}</Text>}
      {panel === 'coordinate' ? <>
        {detail.canCancel && !historical ? <PhysicalgoodsCoordination state={t} onSelectingChange={setLocationSelecting} /> : <PhysicalgoodsCoordinationMessages state={t} />}
      </> : <>
        <TransactionFeedback loading={false} error={t.error} onRetry={t.reload} disabled={t.busy || t.loading} compact />
        {t.busy && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>{copy.saving}</Text>}
        <TransactionConfirmations variant="people" donation={detail.modality === 'DONACION'} participants={participants} confirmations={detail.confirmations} currentUserId={currentUserId}>
          <AgreementActionBar inline view={view} canConfirm={detail.canConfirm} readOnly={historical} busy={t.busy && t.operation === 'confirm'} disabled={disabled || t.loading || Boolean(t.error) || !currentDetail} onConfirm={() => t.selectAction('confirm')} />
        </TransactionConfirmations>
        <PhysicalgoodsTransactionRating state={t} />
      </>}
    </AgreementStepModal>}
    <AgreementMenu visible={menuOpen} onClose={() => setMenuOpen(false)} actions={[
      { label: copy.request, disabled: disabled || origin.loading, onPress: () => { if (detail) void origin.open(detail.role === 'PROPIETARIO'); } },
      { label: copy.resource, disabled: !canOpen || disabled, onPress: () => { if (canOpen && detail) onOpen?.(detail.publication.id); } },
      ...(!historical ? [{ label: copy.report, disabled, onPress: () => setReportPrompt(true) }] : []),
      ...(detail?.canCancel && !historical ? [{ label: copy.cancel, disabled, danger: true, onPress: () => t.selectAction('cancel') }] : []),
    ]} />
    {panel !== 'confirm' && decision}
    {origin.request && <PhysicalgoodsHistoryDetail target={origin.request} onClose={origin.close} onAgreement={origin.close} onOpen={canOpen ? onOpen : undefined} />}
  </View></Modal>;
}

function PhysicalgoodsTransactionRating({ state: t }: { state: ReturnType<typeof usePhysicalgoodsTransaction> }) {
  const detail = t.detail;
  if (!detail || detail.status !== 'COMPLETADA') return null;
  return <OwnerRating owner={detail.owner.fullName} rating={detail.rating} canRate={detail.canRate && detail.role === 'RECEPTOR'}
    score={t.ratingScore} confirming={t.ratingConfirmation} disabled={t.busy || t.loading || Boolean(t.error)}
    error={t.error} busy={t.busy} onReload={t.reload}
    onSelect={t.selectRating} onPrepare={t.confirmRating} onSend={() => { void t.rate(); }} onCancel={t.cancelRating} />;
}
