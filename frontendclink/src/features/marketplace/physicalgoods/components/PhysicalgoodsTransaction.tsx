import { safeAreaInset } from '@/lib/layout/safeArea';
import { COORDINATION_MESSAGES_POLL_INTERVAL, useAgreementPolling } from '../../hooks/useAgreementPolling';
import { OwnerRating } from '../../components/OwnerRating';
import { TransactionRating } from '../../components/TransactionRating';
import { Modal, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshScrollView } from '@/components/RefreshScrollView';
import { MarketplaceReportForm } from '../../components/MarketplaceReportForm';
import { usePhysicalgoodsTransaction } from '../hooks/usePhysicalgoodsTransaction';
import type { PhysicalgoodsTransaction as TransactionDetail, PhysicalgoodsTransactionTarget } from '../types/publication';
import { AgreementNotice, detailUI } from '../../components/ResourceDetailUI';
import { AgreementHeader, AgreementSummary, AgreementMenu, AgreementStepper, AgreementActionBar, AgreementPanelSkeleton, type AgreementStep } from '../../components/AgreementUI';
import { agreementCopy as copy, agreementPresentation } from '../../utils/agreementPresentation';
import { TransactionConfirmations, TransactionDecisionDialog, TransactionFeedback, transactionUI } from '../../components/TransactionUI';
import { PhysicalgoodsCoordination, PhysicalgoodsCoordinationMessages } from './PhysicalgoodsCoordination';
import { PhysicalgoodsAgreementProduct } from './PhysicalgoodsAgreementProduct';
import {PhysicalgoodsOriginalPrice} from './PhysicalgoodsPriceHistory';
import { AgreementStepModal } from '../../components/AgreementStepModal';
import { CATALOG_COLORS as colors } from '../../components/CatalogUI';
import { CheckCircle2 } from 'lucide-react-native';
import { RequestButton } from '../../components/RequestsUI';

/** Acuerdo autorizado; ubicación y mensajes no son requisitos para confirmar. */
export function PhysicalgoodsTransaction({ target, onClose, onChanged, refreshEnabled = true, panelsOnly = false, initialPanel, initialDetail, initialHistorical = false, onDetailChanged, onAccessDenied }: {
  target: PhysicalgoodsTransactionTarget; onClose: () => void; onChanged: () => void; onOpen?: (id: string) => void; refreshEnabled?: boolean;
  panelsOnly?: boolean; initialPanel?: AgreementStep | 'menu';
  initialDetail?: TransactionDetail; initialHistorical?: boolean; onDetailChanged?: (detail: TransactionDetail) => void; onAccessDenied?: () => void;
}) {
  const t = usePhysicalgoodsTransaction(target, onChanged), insets = useSafeAreaInsets();
  const [reporting, setReporting] = useState(false), [reportBusy, setReportBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(initialPanel === 'menu'), [reportPrompt, setReportPrompt] = useState(false);
  const [panel, setPanel] = useState<AgreementStep | 'overview'>(initialPanel && initialPanel !== 'menu' ? initialPanel : 'overview'), [locationSelecting, setLocationSelecting] = useState(false);
  const targetKey = `${target.publicationId}:${target.transactionId}`;
  const snapshot = useRef<{ key: string; detail: NonNullable<typeof t.detail>; historical: boolean } | null>(null);
  const reported = useRef<TransactionDetail | null>(null);
  const denied = useRef(false);
  if (!snapshot.current && initialDetail && initialDetail.id === target.transactionId && initialDetail.publication.id === target.publicationId) snapshot.current = { key: targetKey, detail: initialDetail, historical: initialHistorical };
  const currentDetail = t.detail?.id === target.transactionId && t.detail?.publication.id === target.publicationId ? t.detail : null;
  if (currentDetail) snapshot.current = { key: targetKey, detail: currentDetail, historical: t.historical };
  const detail = t.accessDenied ? null : currentDetail ?? ((panelsOnly || panel !== 'overview') && snapshot.current?.key === targetKey ? snapshot.current.detail : null);
  const historical = currentDetail ? t.historical : snapshot.current?.key === targetKey ? snapshot.current.historical : t.historical;
  useEffect(() => {
    if (currentDetail && !t.loading && !t.busy && !t.error && reported.current !== currentDetail) { reported.current = currentDetail; onDetailChanged?.(currentDetail); }
  }, [currentDetail, t.loading, t.busy, t.error, onDetailChanged]);
  useEffect(() => { if (t.accessDenied && !denied.current) { denied.current = true; onAccessDenied?.(); } else if (!t.accessDenied) denied.current = false; }, [t.accessDenied, onAccessDenied]);
  useEffect(() => { setPanel(initialPanel && initialPanel !== 'menu' ? initialPanel : 'overview'); setMenuOpen(initialPanel === 'menu'); }, [target.publicationId, target.transactionId, initialPanel]);
  useEffect(() => {
    if (panel !== 'coordinate') return;
    t.refreshMessages();
    return () => t.cancelMessageRefresh();
  }, [panel, target.publicationId, target.transactionId]);
  const disabled = t.busy || reportBusy || Boolean(t.action) || reportPrompt;
  const close = () => { if (!disabled) { if (reporting) { setReporting(false); if (panelsOnly) setMenuOpen(true); } else onClose(); } };
  const view = detail ? agreementPresentation(detail) : null;
  const ratingSession = useRef({ key: targetKey, started: false });
  if (ratingSession.current.key !== targetKey) ratingSession.current = { key: targetKey, started: false };
  const ratingReady = !historical && detail?.status === 'COMPLETADA' && !detail.rating && detail.canRate && detail.role === 'RECEPTOR';
  if (ratingReady) ratingSession.current.started = true;
  const ratingSaved = Boolean(ratingSession.current.started && detail?.rating);
  const confirmPhase = ratingReady ? 'rating' : ratingSaved ? 'saved' : 'confirm';
  const confirmationTitle = ratingReady ? 'Valorar transacción' : ratingSaved ? 'Valoración enviada' : copy.confirmStep;
  const participants = detail ? [{ id: detail.owner.id, name: detail.owner.fullName, role: 'PROPIETARIO' }, { id: detail.receiver.id, name: detail.receiver.fullName, role: 'RECEPTOR' }] : [];
  const currentUserId = detail?.role === 'PROPIETARIO' ? detail.owner.id : detail?.receiver.id;
  const cancellationMessage = detail?.publication.isWithdrawn ? copy.cancelWithdrawn
    : ['OCULTO', 'CANCELADO'].includes(detail?.publication.status ?? '') ? copy.cancelHidden
      : copy.cancelAvailable;
  const refreshing = t.loading || t.messagesLoading || t.messagesRefreshing || t.optionsLoading;
  const interacting = disabled || menuOpen || panel === 'accepted' || locationSelecting || reporting || Boolean(t.ratingConfirmation);
  useEffect(() => { if (interacting) t.cancelPolling?.(); }, [interacting]);
  useAgreementPolling(() => t.poll({ messages: panel !== 'coordinate' }), refreshEnabled && !refreshing && !interacting && !t.error && Boolean(view && !view.terminal));
  useAgreementPolling(t.pollMessages, panel === 'coordinate' && refreshEnabled && !refreshing && !interacting && Boolean(view && !view.terminal), COORDINATION_MESSAGES_POLL_INTERVAL, t.cancelMessagePolling);
  const closeStep = () => { if (!t.busy) { if (t.action) t.cancelAction(); else { t.cancelMessageRefresh(); if (panelsOnly) onClose(); else setPanel('overview'); } } };
  const labels = reportPrompt ? { heading: copy.reportQuestion, confirm: copy.reportYes, back: copy.back }
    : t.action === 'cancel' ? { heading: copy.cancelQuestion, confirm: copy.cancelYes, back: copy.back } : { heading: copy.confirmQuestion, confirm: copy.confirmYes, back: copy.back };
  const decision = <TransactionDecisionDialog action={reportPrompt ? 'confirm' : t.action} labels={labels} title={detail?.publication.title ?? copy.title}
    embedded={panelsOnly || panel === 'confirm'} description={reportPrompt ? copy.reportHelp : t.action === 'cancel' ? cancellationMessage : copy.confirmHelp} disabled={t.busy || t.loading}
    onConfirm={() => { if (reportPrompt) { setReportPrompt(false); setReporting(true); } else { if (panelsOnly && t.action === 'cancel') setMenuOpen(true); void (t.action === 'cancel' ? t.cancel() : t.confirm()); } }} onCancel={() => { if (reportPrompt) setReportPrompt(false); else t.cancelAction(); if (panelsOnly && panel === 'overview') setMenuOpen(true); }} />;
  const panelTitle = panel === 'accepted' ? copy.product : panel === 'coordinate' ? detail ? copy.coordinationTitle(detail.publication.title) : copy.coordinateStep : panel === 'confirm' ? confirmationTitle : copy.menu;
  const reportForm = <MarketplaceReportForm target={{ type: 'TRANSACCION', ...target }} title={detail?.publication.title ?? copy.title} showHeading={!panelsOnly} backLabel={panelsOnly ? null : undefined} onBusyChange={setReportBusy} onBack={() => { setReporting(false); if (panelsOnly) setMenuOpen(true); t.reload(); }} />;
  const menuActions = [
    ...(detail && !historical ? [{ label: copy.report, disabled: disabled || t.loading || !currentDetail || Boolean(t.error), onPress: () => setReportPrompt(true) }] : []),
    ...(detail?.canCancel && !historical ? [{ label: copy.cancel, disabled: disabled || t.loading || !currentDetail || Boolean(t.error), danger: true, onPress: () => t.selectAction('cancel') }] : []),
  ];
  const messageRefresh = { onRefresh: t.refreshMessages, refreshing: t.messagesRefreshing, enabled: refreshEnabled && !disabled && !locationSelecting && !t.loading && !t.messagesLoading && !t.messagesRefreshing, label: copy.messagesRefresh };
  const confirmationRefresh = { onRefresh: t.refreshDetail, refreshing: t.detailRefreshing, enabled: refreshEnabled && !disabled && !t.loading && !t.ratingConfirmation && Boolean(currentDetail) && !t.accessDenied, label: copy.confirmationsRefresh };
  const panelRefresh = panel === 'coordinate' ? messageRefresh : panel === 'confirm' ? confirmationRefresh : undefined;
  const stepContent = detail && view && <>
    {historical && <Text style={detailUI.helper}>{copy.history}</Text>}
    {panel === 'coordinate' ? <>
      {t.error && <TransactionFeedback loading={false} error={t.error} onRetry={t.reload} disabled={t.busy || t.loading} compact />}
      {(t.messagesLoading && !t.messages) || (t.optionsLoading && !t.options) || (t.messages === null && !t.messageError) || (!historical && detail.canCancel && t.options === null && !t.optionsError)
        ? <AgreementPanelSkeleton panel="coordinate" /> : detail.canCancel && !historical ? <PhysicalgoodsCoordination state={t} onSelectingChange={setLocationSelecting} /> : <PhysicalgoodsCoordinationMessages state={t} />}
    </> : <>
      <TransactionFeedback loading={false} error={t.error} onRetry={t.reload} disabled={t.busy || t.loading} compact />
      {ratingReady ? <PhysicalgoodsTransactionRating state={t} preview={detail} /> : ratingSaved ? <View style={[detailUI.card, { alignItems: 'center', gap: 16, paddingVertical: 28 }]}>
        <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><CheckCircle2 size={40} color={colors.primary} /></View>
        <Text accessibilityRole="header" style={{ color: colors.primary, fontSize: 20, fontWeight: '700' }}>Gracias por valorar</Text>
        <Text style={[detailUI.helper, { textAlign: 'center' }]}>Tu valoración ya aparece en la transacción.</Text>
        <RequestButton label="Listo" onPress={closeStep} />
      </View> : <TransactionConfirmations variant="people" donation={detail.modality === 'DONACION'} participants={participants} confirmations={detail.confirmations} currentUserId={currentUserId}>
        <AgreementActionBar inline view={view} canConfirm={detail.canConfirm} readOnly={historical} busy={(t.busy || t.loading) && t.operation === 'confirm'} disabled={disabled || t.loading || Boolean(t.error) || !currentDetail} onConfirm={() => { void t.confirmExchange(); }} />
        <AgreementNotice />
      </TransactionConfirmations>}
    </>}
  </>;
  // Un único Modal nativo desde carga hasta decisión/formulario: evita reemplazos durante la presentación en iOS.
  if (panelsOnly) return <AgreementStepModal title={reporting ? copy.report : panelTitle} closeLabel={panel === 'accepted' ? copy.closeProduct : copy.back} keyboardAvoiding={reporting}
    onClose={panel === 'overview' ? close : closeStep} closeDisabled={t.busy || reportBusy} fillHeight={panel === 'accepted' || panel === 'coordinate' || reporting}
    preferredHeight={!reporting && panel === 'overview' ? 420 : panel === 'confirm' ? 680 : undefined}
    contentStyle={panel === 'accepted' ? { backgroundColor: colors.background, padding: 12, flexGrow: 1 } : panel === 'overview' && !reporting ? { minHeight: 280 } : undefined}
    contentKey={panel === 'confirm' ? confirmPhase : panel} refresh={panelRefresh} overlay={t.action || reportPrompt ? decision : undefined}>
    {reporting ? reportForm : !detail ? t.loading || t.busy ? <AgreementPanelSkeleton panel={panel === 'overview' ? 'menu' : panel} />
      : <TransactionFeedback loading={false} error={t.error || copy.transactionUnavailable} onRetry={t.reload} disabled={t.busy} /> : <>
      {t.busy && panel !== 'confirm' && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>{copy.saving}</Text>}
      {panel === 'overview' ? <>
        {t.error && <TransactionFeedback loading={false} error={t.error} onRetry={t.reload} disabled={t.busy || t.loading} compact />}
        {t.loading ? <AgreementPanelSkeleton panel="menu" /> : historical ? <><Text style={detailUI.helper}>{copy.history}</Text><Text style={detailUI.helper}>{copy.noActions}</Text></>
          : <AgreementMenu embedded visible={!t.action && !reportPrompt} onClose={close} onDismiss={close} actions={menuActions} />}
      </> : panel === 'accepted' ? <PhysicalgoodsAgreementProduct embedded detail={detail} historical={historical} onClose={closeStep} /> : stepContent}
    </>}
  </AgreementStepModal>;
  const content = <View style={detailUI.page}>
    <RefreshScrollView refreshIndicatorOffset={insets.top + 8} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={[transactionUI.content, { paddingTop: safeAreaInset('top', insets.top, { min: 16, offset: 8 }), paddingBottom: safeAreaInset('bottom', insets.bottom, { min: 24, offset: 12 }) }]} keyboardShouldPersistTaps="handled"
      onRefresh={t.reload} refreshing={refreshing} refreshEnabled={panel === 'overview' && refreshEnabled && !refreshing && !interacting && !detail?.canRate} refreshLabel="la transacción">
      <AgreementHeader title={detail ? copy.transactionTitle(detail.publication.title) : copy.title} onBack={close} onMenu={() => setMenuOpen(true)} disabled={disabled} menuDisabled={reporting || t.loading || !detail || historical} />
      {reporting ? reportForm : <>
        <TransactionFeedback loading={t.loading} loadingLabel={copy.loadingTransaction} error={t.error} onRetry={t.reload} disabled={t.busy} />
        {t.busy && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>{copy.saving}</Text>}
        {!t.loading && detail && view && <>
          <AgreementSummary participants={participants} currentUserId={currentUserId} modality={detail.modality} amount={detail.amount} currency={detail.currency} amountContent={<PhysicalgoodsOriginalPrice current={{modality:detail.modality,amount:detail.amount,currency:detail.currency}} original={detail.requestedTerms} currentLabel="Monto acordado" previousLabel="Precio al solicitar"/>}/>
          <AgreementStepper state={view.state} selected={panel === 'overview' ? undefined : panel} disabled={disabled} onSelect={setPanel} />
          {detail.status === 'COMPLETADA' && <TransactionRating score={detail.rating?.score} />}
          {panel === 'overview' && <Text style={detailUI.helper}>{copy.chooseStep}</Text>}
          <AgreementNotice />
          {detail.publication.isWithdrawn && <Text style={detailUI.helper}>{copy.withdrawn}</Text>}
          {historical && <View style={detailUI.notice}><Text style={detailUI.noticeText}>{copy.history}</Text></View>}
          {detail.cancelledById && <Text style={detailUI.helper}>{copy.cancelledBy(participants.find(row => row.id === detail.cancelledById)?.name ?? copy.participant)}</Text>}
        </>}
      </>}
    </RefreshScrollView>
    {!reporting && !t.loading && detail && panel === 'accepted' && <PhysicalgoodsAgreementProduct detail={detail} historical={historical} onClose={closeStep} />}
    {!reporting && detail && view && (panel === 'coordinate' || panel === 'confirm') && <AgreementStepModal title={panel === 'coordinate' ? copy.coordinationTitle(detail.publication.title) : confirmationTitle}
      closeLabel={copy.closeStep(panel === 'coordinate' ? copy.coordinateStep : copy.confirmStep)} onClose={closeStep} closeDisabled={t.busy} fillHeight={panel === 'coordinate'}
      preferredHeight={panel === 'confirm' ? 680 : undefined} contentKey={panel === 'confirm' ? confirmPhase : panel} refresh={panelRefresh}
      overlay={panel === 'confirm' && t.action ? decision : undefined}>
      {stepContent}
    </AgreementStepModal>}
    <AgreementMenu visible={menuOpen} onClose={() => setMenuOpen(false)} actions={menuActions} />
    {panel !== 'confirm' && decision}
  </View>;
  return <Modal visible onRequestClose={close} animationType="slide">{content}</Modal>;
}

function PhysicalgoodsTransactionRating({ state: t, preview }: { state: ReturnType<typeof usePhysicalgoodsTransaction>; preview?: TransactionDetail }) {
  const detail = t.detail ?? preview;
  if (!detail || detail.status !== 'COMPLETADA' || detail.rating) return null;
  return <OwnerRating singleStep owner={detail.owner.fullName} rating={detail.rating} canRate={detail.canRate && detail.role === 'RECEPTOR'}
    score={t.ratingScore} confirming={t.ratingConfirmation} disabled={t.busy || t.loading || Boolean(t.error) || !t.detail}
    busy={(t.busy || t.loading) && t.operation === 'rating'}
    onSelect={t.selectRating} onPrepare={t.confirmRating} onSend={() => { void t.submitRating(); }} onCancel={t.cancelRating} />;
}
