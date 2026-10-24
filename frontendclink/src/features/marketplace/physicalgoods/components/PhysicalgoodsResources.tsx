import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import type { usePhysicalgoodsResources } from '../hooks/usePhysicalgoodsResources';
import { PhysicalgoodsSearchFilters } from './PhysicalgoodsSearchFilters';
import { CatalogPagination, CatalogSkeleton, EmptyState, ui } from '../../components/CatalogUI';
import { detailUI } from '../../components/ResourceDetailUI';
import { ResourceCard } from './ResourceCard';
import { PhysicalgoodsDetail } from './PhysicalgoodsDetail';

export function PhysicalgoodsResources({ resources: r, onPublish, onRequestDetail }: {
  resources: ReturnType<typeof usePhysicalgoodsResources>; onPublish: () => void; onRequestDetail?: (publicationId: string, requestId: string) => void;
}) {
  const [detailBusy, setDetailBusy] = useState(false);
  const close = () => { if (!r.busy && !detailBusy) r.close(); };
  return <View style={{ gap: 16 }}>
    <PhysicalgoodsSearchFilters resources={r} />
    <Text accessibilityRole="header" style={ui.sectionTitle}>Recursos de tu campus</Text>
    {r.error ? <View style={ui.empty}><Text accessibilityRole="alert" style={detailUI.error}>{r.error}</Text><Pressable accessibilityRole="button" disabled={r.loading} onPress={r.search} style={ui.outlined}><Text style={ui.link}>Reintentar</Text></Pressable></View>
      : r.loading ? <CatalogSkeleton grid /> : r.page?.data.length ? <View style={ui.grid}>{r.page.data.map(resource =>
        <ResourceCard key={`${resource.id}:${resource.imageUrl}`} resource={resource} onOpen={() => r.open(resource.id)} />)}
        {r.page.data.length % 2 === 1 && <View style={ui.gridCard} accessible={false} />}
      </View> : <EmptyState filtered={Object.values(r.filters).some(Boolean)} onClear={r.clearFilters} onPublish={onPublish} />}
    <CatalogPagination page={r.number} hasMore={Boolean(r.page?.meta.hasMore)} loading={r.loading} previous={() => r.setNumber(r.number - 1)} next={() => r.setNumber(r.number + 1)} />
    <Modal visible={Boolean(r.selectedId)} onRequestClose={close} animationType="slide">
      {r.selectedId && <PhysicalgoodsDetail key={r.selectedId} resources={r} onClose={close} onBusyChange={setDetailBusy} onRequestDetail={onRequestDetail} />}
    </Modal>
  </View>;
}
