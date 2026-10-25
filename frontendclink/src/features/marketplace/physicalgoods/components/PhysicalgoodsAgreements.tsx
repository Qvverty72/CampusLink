import { useCallback,useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useScrollRefresh } from '@/components/RefreshScrollView';
import { Pagination } from '@/components/Pagination';
import { usePhysicalgoodsTransactions, TRANSACTIONS_PAGE_SIZE } from '../hooks/usePhysicalgoodsTransactions';
import { usePhysicalgoodsAgreementPage } from '../hooks/usePhysicalgoodsAgreementPage';
import type { PhysicalgoodsTransactionSummary } from '../types/publication';
import { AgreementCard, AgreementCardsSkeleton, AgreementTabs, AgreementListSection, type AgreementStep } from '../../components/AgreementUI';
import { PhysicalgoodsTransaction } from './PhysicalgoodsTransaction';
import { RequestButton } from '../../components/RequestsUI';
import { PersonalEmpty } from '../../components/PersonalUI';
import { CATALOG_COLORS as colors } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { agreementCopy as copy, agreementPresentation } from '../../utils/agreementPresentation';

const EMPTY: PhysicalgoodsTransactionSummary[] = [];

export function PhysicalgoodsAgreements({ active, refreshVersion, onExplore, refreshEnabled = true, showTitle = true,onActivityRefresh }: {
  active: boolean; refreshVersion: number; onExplore?: () => void; refreshEnabled?: boolean; showTitle?: boolean;onActivityRefresh?:()=>void;
}) {
  const history = usePhysicalgoodsTransactions(active, refreshVersion), { page, tab, setTab } = history;
  const rows = page?.data ?? EMPTY, enriched = usePhysicalgoodsAgreementPage(rows, active && !history.loading);
  const [selection, setSelection] = useState<{ publicationId: string; transactionId: string; entry: AgreementStep | 'menu' } | null>(null);
  const loading = history.loading || enriched.loading || (active && rows.some(row => !enriched.details[row.id] && !enriched.failed.includes(row.id)));
  const refreshAll=useCallback(()=>{onActivityRefresh?.();history.reload();},[onActivityRefresh,history.reload]);
  const reload=onActivityRefresh?refreshAll:history.reload;
  useScrollRefresh(reload, loading, active && refreshEnabled && !loading && !selection, copy.title, active);
  const items = rows.map(row => {
    const detail = enriched.details[row.id], view = detail ? agreementPresentation(detail) : null;
    const status = detail?.status ?? row.status;
    return { row, detail, view, actionable: Boolean(view?.requiresAction && (detail?.canConfirm || detail?.canCancel)), terminal: status === 'COMPLETADA' || status === 'CANCELADA' };
  });
  const activeItems = items.filter(item => !item.terminal), finished = items.filter(item => item.terminal).sort((a, b) =>
    Date.parse(b.detail?.completedAt ?? b.detail?.cancelledAt ?? b.row.startedAt) - Date.parse(a.detail?.completedAt ?? a.detail?.cancelledAt ?? a.row.startedAt));
  const groups = tab === 'finished' ? [{ label: '', items: finished }] : [
    { label: copy.actionGroup, items: activeItems.filter(item => item.actionable) },
    { label: copy.waitingGroup, items: activeItems.filter(item => item.view?.state === 'ESPERANDO_OTRO') },
    { label: copy.otherGroup, items: activeItems.filter(item => !item.view || (item.view.requiresAction && !item.actionable)) },
  ];
  const counts = { ...(page?.meta.counts ?? { active: 0, finished: 0 }) };
  let membershipChanged = false;
  // Una mutación puede mover una fila antes del próximo GET de historial.
  for (const item of items) {
    const wasFinished = ['COMPLETADA', 'CANCELADA'].includes(item.row.status);
    if (wasFinished !== item.terminal) { membershipChanged = true; counts[wasFinished ? 'finished' : 'active']--; counts[item.terminal ? 'finished' : 'active']++; }
  }
  const count = Math.max(0, counts[tab]), totalPages = Math.max(1, Math.ceil(count / TRANSACTIONS_PAGE_SIZE));
  useEffect(() => { if (!loading && !history.error && !selection && history.number > totalPages) history.setNumber(totalPages); }, [loading, history.error, selection, history.number, totalPages]);
  useEffect(() => { if (membershipChanged && !selection && !loading && !history.error) history.refreshCurrent(); }, [membershipChanged, selection, loading, history.error, history.refreshCurrent]);
  return <AgreementListSection>
    {showTitle && <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>}
    <AgreementTabs selected={tab} onSelect={setTab} counts={counts} showCounts={!loading && !history.error} />
    {history.error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{history.error}</Text><RequestButton label={copy.retry} onPress={reload} /></View>}
    {loading ? <AgreementCardsSkeleton /> : !history.error && <>
      {enriched.failed.length > 0 && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.helper}>{copy.partial}</Text><RequestButton label={copy.retry} onPress={enriched.reload} /></View>}
      {!count && <PersonalEmpty title={tab === 'active' ? copy.emptyActive : copy.emptyFinished} helper={copy.emptyHelp}
        action={onExplore ? copy.explore : copy.retry} onAction={onExplore ?? reload} />}
      {groups.filter(group => group.items.length).map(group => <AgreementListSection key={group.label} label={group.label}>
        {group.items.map(({ row, detail, view }) => {
          const terminalState = row.status === 'COMPLETADA' ? 'FINALIZADO' : row.status === 'CANCELADA' ? 'CANCELADO' : undefined;
          const closed = detail?.completedAt ?? detail?.cancelledAt;
          return <AgreementCard key={row.id} title={detail?.publication.title ?? row.publication.title}
            roleLabel={view?.roleLabel ?? (row.role === 'PROPIETARIO' ? row.modality === 'DONACION' ? copy.donor : copy.seller : row.modality === 'DONACION' ? copy.recipient : copy.buyer)}
            participants={detail ? [{ id: detail.owner.id, name: detail.owner.fullName, role: 'PROPIETARIO' }, { id: detail.receiver.id, name: detail.receiver.fullName, role: 'RECEPTOR' }] : undefined}
            currentUserId={detail ? detail.role === 'PROPIETARIO' ? detail.owner.id : detail.receiver.id : undefined}
            modality={detail?.modality ?? row.modality} amount={detail ? detail.amount : row.amount} currency={detail?.currency ?? row.currency}
            ratingScore={detail?.status === 'COMPLETADA' ? detail.rating?.score : null}
            state={view?.state ?? terminalState} label={view?.label ?? (terminalState === 'FINALIZADO' ? copy.finishedStatus : terminalState === 'CANCELADO' ? copy.cancelled : copy.unknown)}
            dateLabel={closed ? copy.closed(new Date(closed).toLocaleDateString('es-CL')) : copy.initiated(new Date(row.startedAt).toLocaleDateString('es-CL'))}
            disabled={Boolean(selection)} onSelect={entry => setSelection({ publicationId: row.publication.id, transactionId: row.id, entry })}
            onMenu={() => setSelection({ publicationId: row.publication.id, transactionId: row.id, entry: 'menu' })} />;
        })}
      </AgreementListSection>)}
    </>}
    {!loading && !history.error && count >= TRANSACTIONS_PAGE_SIZE && <Pagination page={history.number} totalPages={totalPages} showSinglePage
      label={`Paginación de transacciones ${tab === 'active' ? 'activas' : 'finalizadas'}`} onPageChange={value => { if (!selection) history.setNumber(value); }} />}
    {selection && active && <PhysicalgoodsTransaction key={`${enriched.scope}:${selection.publicationId}:${selection.transactionId}:${selection.entry}`} target={{ publicationId: selection.publicationId, transactionId: selection.transactionId }} initialPanel={selection.entry} panelsOnly refreshEnabled={refreshEnabled}
      initialDetail={enriched.details[selection.transactionId]} initialHistorical={enriched.details[selection.transactionId]?.campus.id !== enriched.campusId}
      onDetailChanged={value=>{const previous=enriched.details[value.id];enriched.update(value);if(previous?.status!==value.status)onActivityRefresh?.();}} onAccessDenied={() => enriched.invalidate(selection.publicationId, selection.transactionId)} onChanged={() => { void enriched.refresh(selection.publicationId, selection.transactionId); }} onClose={() => setSelection(null)} />}
  </AgreementListSection>;
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 26, lineHeight: 34, fontWeight: '800' },
});
