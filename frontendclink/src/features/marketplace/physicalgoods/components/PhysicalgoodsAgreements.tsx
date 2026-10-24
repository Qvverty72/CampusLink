import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useScrollRefresh } from '@/components/RefreshScrollView';
import { usePhysicalgoodsHistory } from '../hooks/usePhysicalgoodsHistory';
import { usePhysicalgoodsAgreementPage } from '../hooks/usePhysicalgoodsAgreementPage';
import type { PhysicalgoodsTransactionSummary, PhysicalgoodsTransactionsPage } from '../types/publication';
import { AgreementCard } from '../../components/AgreementUI';
import { RequestsPager, RequestButton } from '../../components/RequestsUI';
import { PersonalEmpty, PersonalSkeleton } from '../../components/PersonalUI';
import { CATALOG_COLORS as colors, ui } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { agreementCopy as copy, agreementPresentation } from '../../utils/agreementPresentation';

const EMPTY: PhysicalgoodsTransactionSummary[] = [];

export function PhysicalgoodsAgreements({ active, refreshVersion, onAgreement, onExplore, refreshEnabled = true, showTitle = true }: {
  active: boolean; refreshVersion: number; onAgreement: (publicationId: string, transactionId: string) => void; onExplore?: () => void; refreshEnabled?: boolean; showTitle?: boolean;
}) {
  const history = usePhysicalgoodsHistory(active, true, refreshVersion), page = history.page as PhysicalgoodsTransactionsPage | null;
  const rows = page?.data ?? EMPTY, enriched = usePhysicalgoodsAgreementPage(rows, active && !history.loading);
  const [tab, setTab] = useState<'active' | 'finished'>('active');
  const loading = history.loading || enriched.loading || (active && rows.some(row => !enriched.details[row.id] && !enriched.failed.includes(row.id)));
  useScrollRefresh(history.reload, loading, active && refreshEnabled && !loading, copy.title, active);
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
  const count = tab === 'finished' ? finished.length : activeItems.length;
  return <View style={styles.section}>
    {showTitle && <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>}<Text style={detailUI.helper}>{copy.pageScope}</Text>
    <View accessibilityRole="tablist" style={styles.tabs}>{([{ id: 'active', label: copy.active, count: activeItems.length }, { id: 'finished', label: copy.finished, count: finished.length }] as const).map(option =>
      <Pressable key={option.id} accessibilityRole="tab" aria-selected={tab === option.id} accessibilityState={{ selected: tab === option.id }} onPress={() => setTab(option.id)} style={[styles.tab, tab === option.id && styles.selected]}>
        <Text style={[detailUI.body, tab === option.id && { fontWeight: '700' }]}>{option.label}{!loading && !history.error ? ` · ${option.count}` : ''}</Text>
      </Pressable>)}
    </View>
    {history.error && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.error}>{history.error}</Text><RequestButton label={copy.retry} onPress={history.reload} /></View>}
    {loading ? <PersonalSkeleton label={copy.loading} /> : !history.error && <>
      {enriched.failed.length > 0 && <View style={detailUI.card}><Text accessibilityRole="alert" style={detailUI.helper}>{copy.partial}</Text><RequestButton label={copy.retry} onPress={enriched.reload} /></View>}
      {!count && <PersonalEmpty title={tab === 'active' ? copy.emptyActive : copy.emptyFinished} helper={copy.pageScope}
        action={onExplore ? copy.explore : copy.retry} onAction={onExplore ?? history.reload} />}
      {groups.filter(group => group.items.length).map(group => <View key={group.label} style={styles.section}>
        {Boolean(group.label) && <Text accessibilityRole="header" style={styles.groupTitle}>{group.label.toLocaleUpperCase('es-CL')}</Text>}
        {group.items.map(({ row, detail, view, actionable }) => {
          const terminalState = row.status === 'COMPLETADA' ? 'FINALIZADO' : row.status === 'CANCELADA' ? 'CANCELADO' : undefined;
          const closed = detail?.completedAt ?? detail?.cancelledAt;
          return <AgreementCard key={row.id} title={detail?.publication.title ?? row.publication.title} campus={detail?.campus.name ?? row.campus.name}
            roleLabel={view?.roleLabel ?? (row.role === 'PROPIETARIO' ? row.modality === 'DONACION' ? copy.donor : copy.seller : row.modality === 'DONACION' ? copy.recipient : copy.buyer)}
            price={(detail?.modality ?? row.modality) === 'DONACION' ? copy.donation : `$${(detail?.amount ?? row.amount)?.toLocaleString('es-CL')}`}
            state={view?.state ?? terminalState} label={view?.label ?? (terminalState === 'FINALIZADO' ? copy.finishedStatus : terminalState === 'CANCELADO' ? copy.cancelled : copy.unknown)}
            requiresAction={actionable} next={view && !view.terminal ? detail && !detail.canConfirm && !detail.canCancel ? copy.readOnly : view.next : undefined}
            dateLabel={closed ? copy.closed(new Date(closed).toLocaleDateString('es-CL')) : copy.initiated(new Date(row.startedAt).toLocaleDateString('es-CL'))}
            onPress={() => onAgreement(row.publication.id, row.id)} />;
        })}
      </View>)}
      {tab === 'active' && finished.length > 0 && <RequestButton variant="text" label={copy.viewFinished(finished.length)} onPress={() => setTab('finished')} />}
    </>}
    <RequestsPager itemLabel={copy.title} page={history.number} hasMore={Boolean(page?.meta.hasMore)} disabled={loading} onPrevious={() => history.setNumber(history.number - 1)} onNext={() => history.setNumber(history.number + 1)} />
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 14 }, title: { color: colors.ink, fontSize: 26, lineHeight: 34, fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: colors.tint, borderRadius: 16, padding: 4 }, tab: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 12 },
  selected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, groupTitle: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
