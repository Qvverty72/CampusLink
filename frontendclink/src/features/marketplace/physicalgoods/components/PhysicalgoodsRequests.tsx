import { Text, View } from 'react-native';
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
  const r = usePhysicalgoodsRequests(active, onResolved, received, refreshVersion);
  useScrollRefresh(r.reload, r.loading, active && refreshEnabled && !r.busy && !r.loading && !r.selection, received ? 'las solicitudes recibidas' : 'mis solicitudes', active);
  const disabled = r.busy || r.loading || Boolean(r.selection);
  return <View style={requestUI.section}>
    {onModeChange && <RequestSegments received={received} onChange={onModeChange} disabled={r.busy || Boolean(r.selection)} pendingCount={received && !r.loading && !r.error && r.page ? r.page.data.filter(row => row.status === 'PENDIENTE').length : undefined} />}
    {r.feedback && <View accessibilityLiveRegion="polite" style={detailUI.notice}><Text style={detailUI.noticeText}>{r.feedback}</Text></View>}
    <RequestsFeedback loading={false} error={r.error} empty={!r.loading && Boolean(r.page && !r.page.data.length)} received={received} onReload={r.reload} disabled={r.busy} redesigned firstPage={r.number === 1} onExplore={onExplore} />
    {!received && <PhysicalgoodsSentRequests state={r}/>}
    {received && <PhysicalgoodsReceivedRequests state={r} onDetail={onDetail} onAgreement={onAgreement}/>}
    <RequestsPager page={r.number} hasMore={Boolean(r.page?.meta.hasMore)} disabled={disabled} itemLabel={received?'Recursos con solicitudes':'Solicitudes'} onPrevious={() => r.setNumber(r.number - 1)} onNext={() => r.setNumber(r.number + 1)} />
    <RequestDecisionDialog selection={r.selection ? { name: r.selection.request.requester.fullName, title: r.selection.request.publication.title, decision: r.selection.decision } : null}
      physical disabled={r.busy || r.loading} onConfirm={() => { void r.resolve(); }} onCancel={r.cancel} />
  </View>;
}
