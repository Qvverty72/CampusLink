import { View, Text, Pressable } from 'react-native';
import type { useDigitalTradeCenter } from '../hooks/useDigitalTrades';
import { ui } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { RequestButton, RequestCard, RequestDecisionDialog, RequestsFeedback, RequestsHeader, RequestsPager, requestStatusLabel, requestUI } from '../../components/RequestsUI';

type Requests = ReturnType<typeof useDigitalTradeCenter>;
export function DigitalRequests({ state }: { state: Requests }) {
  const disabled = state.busy || state.loading || Boolean(state.selection);
  const tabsDisabled = state.busy || Boolean(state.selection);
  return <View style={{ gap: 16 }}>
    <View accessibilityRole="tablist" style={requestUI.inline}>{[{ value: false, label: 'Enviadas' }, { value: true, label: 'Recibidas' }].map(tab => <Pressable key={tab.label}
      accessibilityRole="tab" accessibilityState={{ selected: state.received === tab.value, disabled: tabsDisabled }} disabled={tabsDisabled} onPress={() => state.mode(tab.value)}
      style={[ui.chip, state.received === tab.value && ui.activeChip, tabsDisabled && ui.disabled]}><Text style={[ui.chipText, state.received === tab.value && ui.activeChipText]}>{tab.label}</Text></Pressable>)}</View>
    <RequestsHeader compact received={state.received} helper={state.received ? 'Cada persona tiene su propio acuerdo. Tu recurso sigue disponible para otros estudiantes.' : 'Revisa tus solicitudes y continúa los acuerdos que ya fueron aceptados.'}
      loading={state.loading} busy={state.busy} onReload={state.reload} />
    <RequestsFeedback loading={state.loading} error={state.error} empty={!state.rows.length} received={state.received} onReload={state.reload} disabled={state.busy} />
    {!state.loading && Boolean(state.rows.length) && <View style={requestUI.list}>{state.rows.map(row => <RequestCard digital key={row.id} title={row.title} requester={state.received ? row.requesterName : undefined} status={row.status} requestedAt={row.requestedAt} message={row.message}
      historical={['RECHAZADA', 'CANCELADA'].includes(row.status) || ['COMPLETADA', 'CANCELADA'].includes(row.transactionStatus ?? '')}>
      {row.transactionStatus && <Text style={detailUI.helper}>Acuerdo: {requestStatusLabel(row.transactionStatus)}</Text>}
      {state.received && row.status === 'PENDIENTE' && <View style={requestUI.inline}>
        <RequestButton label="Rechazar" accessibilityLabel={`Rechazar solicitud digital de ${row.requesterName}`} disabled={disabled} onPress={() => state.select(row, 'RECHAZAR')} />
        <RequestButton label="Aceptar" accessibilityLabel={`Aceptar solicitud digital de ${row.requesterName}`} disabled={disabled} onPress={() => state.select(row, 'ACEPTAR')} primary />
      </View>}
      {row.transactionId && <RequestButton variant="text" label="Ver acuerdo digital" disabled={disabled} onPress={() => { void state.showTrade(row); }} />}
    </RequestCard>)}</View>}
    <RequestsPager page={state.page} hasMore={state.hasMore} disabled={disabled} onPrevious={state.previous} onNext={state.next} />
    <RequestDecisionDialog selection={state.selection ? { name: state.selection.request.requesterName, title: state.selection.request.title, decision: state.selection.decision } : null}
      disabled={state.busy || state.loading} onConfirm={() => { void state.resolve(); }} onCancel={state.cancelSelection} />
  </View>;
}
