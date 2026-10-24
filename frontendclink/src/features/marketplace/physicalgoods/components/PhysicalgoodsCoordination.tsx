import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, MapPin } from 'lucide-react-native';
import { CATALOG_COLORS as colors, FilterOptions, FilterSheet, ui } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { RequestButton, RequestsPager } from '../../components/RequestsUI';
import { TransactionFeedback, transactionDate, transactionUI } from '../../components/TransactionUI';
import type { usePhysicalgoodsTransaction } from '../hooks/usePhysicalgoodsTransaction';

type Agreement = ReturnType<typeof usePhysicalgoodsTransaction>;
export function PhysicalgoodsCoordination({ state: t }: { state: Agreement }) {
  const [selecting, setSelecting] = useState<'building' | 'floor' | null>(null);
  const floor = t.building?.floors.find(row => row.id === t.floorId);
  const close = () => { if (!t.busy) setSelecting(null); };
  const choose = (label: string, value: string | undefined, onPress: () => void, disabled: boolean) => <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Seleccionar ${label.toLowerCase()}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[ui.outlined, disabled && ui.disabled, { flexDirection: 'row', justifyContent: 'space-between', padding: 12, gap: 8 }]}>
      <Text style={[detailUI.body, { flex: 1 }]}>{value || `Elige ${label.toLowerCase()}`}</Text><ChevronDown size={18} color={colors.primary} /></Pressable></View>;
  return <View style={detailUI.card}><View style={transactionUI.inline}><MapPin size={21} color={colors.primary} /><Text style={[ui.sectionTitle, { flex: 1 }]}>Coordinar punto de encuentro</Text></View>
    <Text style={detailUI.helper}>Selecciona dónde estás para avisar a la otra persona. Se enviará el mensaje predefinido.</Text>
    <TransactionFeedback loading={t.optionsLoading} error={t.optionsError} onRetry={t.reloadOptions} disabled={t.busy} compact retryLabel="Reintentar ubicaciones" loadingLabel="Cargando ubicaciones" />
    {!t.optionsLoading && !t.optionsError && t.options && !t.options.buildings.length && <><Text style={detailUI.helper}>No hay edificios y pisos disponibles en el mapa del campus. Puedes continuar con las confirmaciones.</Text><RequestButton label="Consultar ubicaciones" onPress={t.reloadOptions} disabled={t.busy} /></>}
    {!t.optionsLoading && Boolean(t.options?.buildings.length) && <>
      {choose('Edificio', t.building?.name, () => setSelecting('building'), t.busy)}
      {choose('Piso', floor?.name, () => setSelecting('floor'), t.busy || !t.building?.floors.length)}
    </>}
    {t.preview && <View style={detailUI.notice}><Text accessibilityLiveRegion="polite" style={detailUI.noticeText}>{t.preview}</Text></View>}
    <RequestButton label={t.busy ? 'Guardando…' : 'Enviar mensaje'} onPress={() => { void t.send(); }} disabled={t.busy || !t.preview || t.optionsLoading || Boolean(t.optionsError)} primary />
    <FilterSheet visible={Boolean(selecting)} title={selecting === 'floor' ? 'Seleccionar piso' : 'Seleccionar edificio'} confirmLabel="Volver al acuerdo" onClose={close}>
      <FilterOptions label={selecting === 'floor' ? 'Piso' : 'Edificio'} allowEmpty={false} options={selecting === 'floor' ? t.building?.floors ?? [] : t.options?.buildings ?? []} value={selecting === 'floor' ? t.floorId : t.buildingId}
        onChange={value => { if (!t.busy) { if (selecting === 'floor') t.setFloor(value); else t.setBuilding(value); setSelecting(null); } }} />
    </FilterSheet>
  </View>;
}

export function PhysicalgoodsCoordinationMessages({ state: t }: { state: Agreement }) {
  const name = (id: string) => id === t.detail?.owner.id ? t.detail.owner.fullName : t.detail?.receiver.fullName;
  return <View style={detailUI.card}><Text style={ui.sectionTitle}>Mensajes de coordinación</Text>
    <TransactionFeedback loading={t.messagesLoading} error={t.messageError} onRetry={t.reloadMessages} disabled={t.busy} compact retryLabel="Reintentar mensajes" loadingLabel="Cargando mensajes de coordinación" />
    {!t.messagesLoading && !t.messageError && t.messages && !t.messages.data.length && <><Text style={detailUI.helper}>Todavía no hay mensajes de coordinación.</Text><RequestButton label="Actualizar mensajes" onPress={t.reloadMessages} disabled={t.busy} /></>}
    {!t.messagesLoading && t.messages?.data.map(message => <View key={message.id} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.tint, gap: 5 }}>
      <Text style={ui.link}>{name(message.senderId)}</Text><Text style={detailUI.body}>{message.text}</Text><Text style={detailUI.helper}>{transactionDate(message.createdAt)}</Text>
    </View>)}
    <RequestsPager itemLabel="Mensajes" page={t.page} hasMore={Boolean(t.messages?.meta.hasMore)} disabled={t.busy || t.messagesLoading} onPrevious={() => t.setPage(t.page - 1)} onNext={() => t.setPage(t.page + 1)} />
  </View>;
}
