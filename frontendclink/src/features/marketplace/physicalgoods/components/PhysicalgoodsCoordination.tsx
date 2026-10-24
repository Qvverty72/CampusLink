import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { CATALOG_COLORS as colors, FilterOptions, FilterSheet, ui } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { RequestButton, RequestsPager } from '../../components/RequestsUI';
import { TransactionFeedback, transactionDate } from '../../components/TransactionUI';
import { agreementCopy as copy } from '../../utils/agreementPresentation';
import type { usePhysicalgoodsTransaction } from '../hooks/usePhysicalgoodsTransaction';

type Agreement = ReturnType<typeof usePhysicalgoodsTransaction>;
export function PhysicalgoodsCoordination({ state: t, onSelectingChange }: { state: Agreement; onSelectingChange?: (open: boolean) => void }) {
  const [selecting, setSelecting] = useState<'building' | 'floor' | 'poi' | null>(null);
  useEffect(() => () => onSelectingChange?.(false), [onSelectingChange]);
  const floor = t.building?.floors.find(row => row.id === t.floorId);
  const pois = floor?.pois ?? [], poi = pois.find(row => row.id === t.poiKey);
  const close = () => { if (!t.busy) { setSelecting(null); onSelectingChange?.(false); } };
  const choose = (label: string, field: 'building' | 'floor' | 'poi', value: string | undefined, disabled: boolean) => <Pressable accessibilityRole="button"
    accessibilityLabel={copy.selectLocation(label)} accessibilityState={{ disabled }} disabled={disabled}
    onPress={() => { setSelecting(field); onSelectingChange?.(true); }} style={[ui.outlined, styles.choice, disabled && ui.disabled]}>
    <Text style={[detailUI.body, { flex: 1 }]}>{value || label}</Text><ChevronDown size={18} color={colors.primary} />
  </Pressable>;
  return <View style={detailUI.card}>
    <Text accessibilityRole="header" style={ui.sectionTitle}>{copy.where}</Text><Text style={detailUI.helper}>{copy.locationHelp}</Text>
    <TransactionFeedback loading={t.optionsLoading} error={t.optionsError} onRetry={t.reloadOptions} disabled={t.busy} compact retryLabel={copy.locationRetry} loadingLabel={copy.locationLoading} />
    {!t.optionsLoading && !t.optionsError && t.options && !t.options.buildings.length && <Text style={detailUI.helper}>{copy.noLocations}</Text>}
    <View style={styles.choices}>
      {choose(copy.building, 'building', t.building?.name, t.busy || t.loading || t.optionsLoading || !t.options?.buildings.length)}
      {t.building && choose(copy.floor, 'floor', floor?.name, t.busy || t.loading || t.optionsLoading || !t.building.floors.length)}
      {floor && pois.length > 0 && choose(copy.poiOptional, 'poi', poi?.name, t.busy || t.loading || t.optionsLoading)}
    </View>
    {t.preview && <Text accessibilityLiveRegion="polite" style={detailUI.helper}>{t.preview}</Text>}
    <RequestButton label={copy.location} busy={t.busy && t.operation === 'message'} onPress={() => { void t.send(); }} disabled={t.busy || t.loading || !t.preview || t.optionsLoading || Boolean(t.optionsError)} primary />
    <PhysicalgoodsCoordinationMessages state={t} embedded />
    <FilterSheet compact visible={Boolean(selecting)} title={copy.selectLocation(selecting === 'poi' ? copy.poi : selecting === 'floor' ? copy.floor : copy.building)} confirmLabel={copy.back} onClose={close}>
      <FilterOptions label={selecting === 'poi' ? copy.poi : selecting === 'floor' ? copy.floor : copy.building} allowEmpty={false}
        options={selecting === 'poi' ? [{ id: '', name: copy.noPoi }, ...pois] : selecting === 'floor' ? t.building?.floors ?? [] : t.options?.buildings ?? []}
        value={selecting === 'poi' ? t.poiKey : selecting === 'floor' ? t.floorId : t.buildingId}
        onChange={value => { if (!t.busy && !t.loading) { if (selecting === 'poi') t.setPoi(value); else if (selecting === 'floor') t.setFloor(value); else t.setBuilding(value); close(); } }} />
    </FilterSheet>
  </View>;
}

export function PhysicalgoodsCoordinationMessages({ state: t, embedded = false }: { state: Agreement; embedded?: boolean }) {
  const currentId = t.detail?.role === 'PROPIETARIO' ? t.detail.owner.id : t.detail?.receiver.id;
  const name = (id: string) => id === t.detail?.owner.id ? t.detail.owner.fullName : id === t.detail?.receiver.id ? t.detail.receiver.fullName : copy.participant;
  const messages = [...(t.messages?.data ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return <View style={embedded ? styles.thread : detailUI.card}>
    <Text accessibilityRole="header" style={ui.sectionTitle}>{copy.messages}</Text>
    <TransactionFeedback loading={t.messagesLoading} error={t.messageError} onRetry={t.reloadMessages} disabled={t.busy} compact retryLabel={copy.messageRetry} loadingLabel={copy.messagesLoading} />
    {!t.messagesLoading && !t.messageError && t.messages && !messages.length && <Text style={detailUI.helper}>{copy.emptyMessages}</Text>}
    {!t.messagesLoading && messages.map(message => {
      const mine = message.senderId === currentId;
      return <View key={message.id} style={[styles.bubble, mine && styles.mine]}>
        <Text style={[styles.name, mine && styles.mineText]}>{name(message.senderId)}{mine ? copy.you : ''}</Text>
        <Text style={[detailUI.body, mine && styles.mineText]}>{message.text}</Text>
        <Text style={[detailUI.helper, mine && styles.mineText]}>{transactionDate(message.createdAt)}</Text>
      </View>;
    })}
    <RequestsPager itemLabel={copy.messages} page={t.page} hasMore={Boolean(t.messages?.meta.hasMore)} disabled={t.busy || t.messagesLoading || t.messagesRefreshing} onPrevious={() => t.setPage(t.page - 1)} onNext={() => t.setPage(t.page + 1)} />
  </View>;
}
const styles = StyleSheet.create({
  choices: { gap: 8 }, choice: { width: '100%', minHeight: 48, flexDirection: 'row', padding: 12, gap: 8 },
  thread: { gap: 12, borderTopWidth: 1, borderColor: colors.border, marginTop: 6, paddingTop: 14 },
  bubble: { maxWidth: '94%', alignSelf: 'flex-start', borderRadius: 14, backgroundColor: colors.tint, padding: 12, gap: 5 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary }, mineText: { color: colors.surface }, name: { color: colors.primary, fontWeight: '700', fontSize: 12 },
});
