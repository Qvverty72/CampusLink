import { Text, View } from 'react-native';
import {useCallback} from 'react';
import {usePhysicalgoodsRequestCounts} from '../hooks/usePhysicalgoodsRequestCounts';
import { usePhysicalgoodsRequests } from '../hooks/usePhysicalgoodsRequests';
import { PhysicalgoodsSentRequests } from './PhysicalgoodsSentRequests';
import { PhysicalgoodsReceivedRequests } from './PhysicalgoodsReceivedRequests';
import { useScrollRefresh } from '@/components/RefreshScrollView';
import { detailUI } from '../../components/ResourceDetailUI';
import { RequestDecisionDialog, RequestSegments, RequestsFeedback, RequestsPager, requestUI } from '../../components/RequestsUI';

/** Lista propia: una reserva conserva las demás solicitudes pendientes. */
export function PhysicalgoodsRequests({ active, onOpen, onResolved, onAgreement, onDetail, received = true, refreshVersion = 0, refreshEnabled = true, onModeChange, onExplore }: {
  onModeChange?: (received: boolean) => void; onExplore?: () => void;
  active: boolean; onOpen?: (id: string) => void; onResolved: () => void; refreshEnabled?: boolean;
  onDetail: (publicationId: string, requestId: string) => void;
  onAgreement: (publicationId: string, transactionId: string) => void; received?: boolean; refreshVersion?: number;
}) {
  const counters=usePhysicalgoodsRequestCounts(active,refreshVersion);
  const r = usePhysicalgoodsRequests(active, onResolved, received, refreshVersion);
  const reload=useCallback(()=>{counters.reload();r.reload();},[counters.reload,r.reload]);
  useScrollRefresh(reload, r.loading, active && refreshEnabled && !r.busy && !r.loading && !r.selection, received ? 'las solicitudes recibidas' : 'mis solicitudes', active);
  const disabled = r.busy || r.loading || Boolean(r.selection);
  const awaitingCount=counters.counts?.receivedPending;
  return <View style={requestUI.section}>
    {onModeChange && <RequestSegments received={received} onChange={onModeChange} showPendingSummary={false} pendingCountLabel={awaitingCount===1?'solicitud por responder':'solicitudes por responder'} disabled={r.busy || Boolean(r.selection)} pendingCount={awaitingCount} acceptedCount={counters.counts?.sentAccepted} countsLoading={counters.loading} />}
    {r.feedback && <View accessibilityLiveRegion="polite" style={detailUI.notice}><Text style={detailUI.noticeText}>{r.feedback}</Text></View>}
    <RequestsFeedback loading={false} error={r.error} empty={!r.loading && Boolean(r.page && !r.page.data.length)} received={received} onReload={reload} disabled={r.busy} redesigned firstPage={r.number === 1} onExplore={onExplore} />
    {!received && <PhysicalgoodsSentRequests state={r}/>}
    {received && <PhysicalgoodsReceivedRequests state={r} onDetail={onDetail} onAgreement={onAgreement}/>}
    <RequestsPager page={r.number} hasMore={Boolean(r.page?.meta.hasMore)} disabled={disabled} itemLabel={received?'Recursos con solicitudes':'Solicitudes'} onPrevious={() => r.setNumber(r.number - 1)} onNext={() => r.setNumber(r.number + 1)} />
    {!received&&<RequestDecisionDialog selection={r.selection ? { name: r.selection.request.requester.fullName, title: r.selection.request.publication.title, decision: r.selection.decision } : null}
      physical disabled={r.busy || r.loading} onConfirm={() => { void r.resolve(); }} onCancel={r.cancel} />}
  </View>;
}
