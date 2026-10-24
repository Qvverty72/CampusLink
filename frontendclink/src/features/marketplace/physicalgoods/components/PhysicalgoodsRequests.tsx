import { Text, View } from 'react-native';
import { usePhysicalgoodsRequests } from '../hooks/usePhysicalgoodsRequests';
import { useScrollRefresh } from '@/components/RefreshScrollView';
import { detailUI } from '../../components/ResourceDetailUI';
import { RequestButton, RequestCard, RequestDecisionDialog, RequestsFeedback, RequestsHeader, RequestsPager, requestStatusLabel, requestUI } from '../../components/RequestsUI';

/** Lista propia: una reserva conserva las demás solicitudes pendientes. */
export function PhysicalgoodsRequests({ active, onOpen, onResolved, onAgreement, onDetail, received = true, refreshVersion = 0, refreshEnabled = true }: {
  active: boolean; onOpen?: (id: string) => void; onResolved: () => void; refreshEnabled?: boolean;
  onDetail: (publicationId: string, requestId: string) => void;
  onAgreement: (publicationId: string, transactionId: string) => void; received?: boolean; refreshVersion?: number;
}) {
  const r = usePhysicalgoodsRequests(active, onResolved, received, refreshVersion);
  useScrollRefresh(r.reload, r.loading, active && refreshEnabled && !r.busy && !r.loading && !r.selection, received ? 'las solicitudes recibidas' : 'mis solicitudes', active);
  const disabled = r.busy || r.loading || Boolean(r.selection);
  return <View style={requestUI.section}>
    <RequestsHeader compact received={received} helper={received ? 'Responde a quienes se interesan en tus recursos. Puedes resolver las pendientes de tu campus actual.' : 'Tu historial de solicitudes y acuerdos, incluidos los de campus anteriores.'}
      loading={r.loading} busy={r.busy} onReload={r.reload} />
    <RequestsFeedback loading={r.loading} error={r.error} empty={Boolean(r.page && !r.page.data.length)} received={received} onReload={r.reload} disabled={r.busy} />
    {!r.loading && Boolean(r.page?.data.length) && <View style={requestUI.list}>{r.page?.data.map(request => <RequestCard key={request.id} title={request.publication.title} requester={received ? request.requester.fullName : undefined}
      keyData={request.publication.modality === 'DONACION' ? 'Donación' : `$${request.publication.price?.toLocaleString('es-CL')}`} status={request.status} requestedAt={request.requestedAt} message={request.message}
      historical={request.publication.isWithdrawn || ['RECHAZADA', 'CANCELADA'].includes(request.status) || ['COMPLETADA', 'CANCELADA'].includes(request.transaction?.status ?? '')}>
      <Text style={detailUI.helper}>{request.campus.name}</Text>
      <View style={requestUI.inline}><Text style={detailUI.helper}>Recurso: {requestStatusLabel(request.publication.status)}</Text>
        {request.transaction && <Text style={detailUI.helper}>Acuerdo: {requestStatusLabel(request.transaction.status)}</Text>}</View>
      {request.publication.isWithdrawn && <Text style={detailUI.helper}>Publicación retirada. Se conserva la solicitud.</Text>}
      {!request.publication.canView && <Text style={detailUI.helper}>Consulta histórica; sin interacción pública en tu campus actual.</Text>}
      {request.publication.canView && request.status === 'PENDIENTE' && request.publication.status === 'RESERVADO' && <Text style={detailUI.helper}>{received ? 'Espera mientras se realiza otro intercambio. Podrás aceptarla si ese acuerdo se cancela.' : 'Tu solicitud sigue pendiente. El recurso está reservado para otra persona.'}</Text>}
      {received && request.canResolve && request.status === 'PENDIENTE' && <View style={requestUI.inline}>
        <RequestButton label="Rechazar" accessibilityLabel={`Rechazar solicitud de ${request.requester.fullName}`} onPress={() => r.select(request, 'RECHAZAR')} disabled={disabled} />
        <RequestButton label="Aceptar" accessibilityLabel={`Aceptar solicitud de ${request.requester.fullName}`} onPress={() => r.select(request, 'ACEPTAR')} primary disabled={disabled || request.publication.status !== 'DISPONIBLE'} />
      </View>}
      {request.transaction && <RequestButton variant="text" label="Ver acuerdo" accessibilityLabel={`Ver acuerdo: ${request.publication.title}`} onPress={() => onAgreement(request.publication.id, request.transaction!.id)} disabled={disabled} />}
      <View style={requestUI.inline}>
        <RequestButton variant="text" label="Ver solicitud" accessibilityLabel={`Ver solicitud: ${request.publication.title}`} onPress={() => onDetail(request.publication.id, request.id)} disabled={disabled} />
        {onOpen && request.publication.canView !== false && <RequestButton variant="text" label="Ver recurso" accessibilityLabel={`Ver recurso: ${request.publication.title}`} onPress={() => onOpen(request.publication.id)} disabled={disabled} />}
      </View>
    </RequestCard>)}</View>}
    {received && Boolean(r.page?.data.length) && <View style={detailUI.notice}><Text style={detailUI.noticeText}>Al aceptar una, el recurso queda reservado. Las demás esperan.</Text></View>}
    <RequestsPager page={r.number} hasMore={Boolean(r.page?.meta.hasMore)} disabled={disabled} onPrevious={() => r.setNumber(r.number - 1)} onNext={() => r.setNumber(r.number + 1)} />
    <RequestDecisionDialog selection={r.selection ? { name: r.selection.request.requester.fullName, title: r.selection.request.publication.title, decision: r.selection.decision } : null}
      physical disabled={r.busy || r.loading} onConfirm={() => { void r.resolve(); }} onCancel={r.cancel} />
  </View>;
}
