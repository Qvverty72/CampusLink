import type { ScrollViewInstance } from 'react-native';
import { APP_COLORS } from '@/types/colors';
/** Presenta información de piso, POI y actividades usando metadatos del mapa activo. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useMapStore } from '@/three/store/mapStore';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { activityLocations } from '@/three/api/activityLocations';
import type { RuntimeMapData } from '@/three/api/mapApi';
import type { FloorDefinition } from '@/three/types/map';
import { PointOfInterestDetail } from '@/three/components/PointOfInterestDetail';
import { PointOfInterestBanner } from '@/three/components/PointOfInterestBanner';
import { LocationActivities } from './LocationActivities';
import { ActivityContentTransition } from './ActivityContentTransition';
import { ScrollRefreshRegistration, RefreshScrollView } from '@/components/RefreshScrollView';
import type { ActivitiesState } from '../hooks/useLocationActivities';
import { filterLocationActivities, type Activity } from '../types/activity';
import { ACTIVITY_TYPES, ActivityTypeCounter } from './ActivityTypeCounter';

export function FloorInfoModal({ activities }: { activities: ActivitiesState }) {
  const map = useMapDataStore(state => state.data);
  const selectedFloor = useMapStore(state => state.selectedFloor);
  const open = useMapStore(state => state.isFloorModalOpen);
  const close = useMapStore(state => state.closeFloorModal);
  const floor = selectedFloor && map ? map.floorData[selectedFloor] : null;
  const building = floor && map ? map.buildingConfigs[floor.buildingId] : null;
  if (!open || !map || !floor || !building) return null;

  return <Modal visible transparent animationType="fade" onRequestClose={close}>
    <View style={styles.overlay}>
      {/* Remount on location/close so reopening always starts at floor information. */}
      <FloorInfoContent key={JSON.stringify([map.campusId, floor.buildingId, floor.id])}
        map={map} floor={floor} activities={activities} onClose={close} />
    </View>
  </Modal>;
}

function FloorInfoContent({ map, floor, activities, onClose }: {
  map: RuntimeMapData; floor: FloorDefinition;
  activities: ActivitiesState; onClose: () => void;
}) {
  const [activityType, setActivityType] = useState<Activity['type'] | null>(null);
  const [selectedPoiKey, setSelectedPoiKey] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const scroll = useRef<ScrollViewInstance>(null);
  const resetScroll = useCallback(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, []);
  const query = { buildingKey: floor.buildingId, floorKey: floor.id };
  const entries = filterLocationActivities(activities.activities, query);
  const hasCounts = !activities.isLoading && !activities.error;
  const pois = (floor.pois ?? []).filter(poi => poi.isVisible === true && !poi.deletedAt);
  // Resuelve el POI sobre el piso actual en lugar de conservar una referencia obsoleta.
  const selectedPoi = pois.find(poi => poi.poiKey === selectedPoiKey);
  const viewKey = selectedPoi ? `poi:${selectedPoi.poiKey}` : activityType ?? 'floor-information';
  useEffect(() => {
    if (selectedPoiKey && !selectedPoi) setSelectedPoiKey(null);
  }, [selectedPoiKey, selectedPoi]);
  useLayoutEffect(resetScroll, [viewKey, detailOpen, resetScroll]);

  return <View style={styles.card}>
    {headerVisible ? <View style={detailOpen ? styles.detailHeader : styles.header}>
      {!detailOpen ? <View style={styles.headerText}>
        <Text accessibilityRole="header" style={styles.title}>{selectedPoi ? 'Información del punto de interés' : activityType ? 'Detalle de actividades' : 'Información del piso'}</Text>
        <Text style={styles.subtitle}>{floor.name}</Text>
      </View> : null}
      <Pressable onPress={onClose} accessibilityRole="button"
        accessibilityLabel={detailOpen ? 'Cerrar ficha de actividad' : selectedPoi ? 'Cerrar información del punto de interés' : 'Cerrar información del piso'} hitSlop={12} style={styles.closeButton}>
        <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <X size={16} color="#475569" strokeWidth={1.7} />
        </View>
      </Pressable>
    </View> : null}
    <RefreshScrollView ref={scroll} style={[styles.scroll, !headerVisible && styles.compactScroll]}
      onClose={onClose} onHeaderVisibilityChange={setHeaderVisible}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ActivityContentTransition transitionKey={viewKey} style={styles.transitionContent}>
      {selectedPoi ? <PointOfInterestDetail key={selectedPoi.poiKey} poi={selectedPoi}
        buildingName={map.buildingConfigs[floor.buildingId].name} floorName={floor.name}
        onBack={() => setSelectedPoiKey(null)} /> : activityType ? <>
        <LocationActivities key={activityType} state={activities} query={query}
          activityType={activityType} locations={activityLocations(map)} onBackToFloorInfo={() => setActivityType(null)}
          onDetailVisibilityChange={setDetailOpen} onEditOpen={resetScroll} onPageChange={resetScroll} />
      </> : <>
        <ScrollRefreshRegistration onRefresh={activities.refresh} refreshing={activities.isLoading}
          enabled={!activities.isLoading} label="las actividades del piso" />
        <View style={styles.overview}>
          <View style={styles.descriptionColumn}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Descripción del piso</Text>
            <Text style={styles.description}>{floor.description?.trim() || 'Este piso aún no tiene una descripción.'}</Text>
          </View>
          <View style={styles.counters}>
            {ACTIVITY_TYPES.map(type => <ActivityTypeCounter key={type} type={type}
              count={hasCounts ? entries.filter(activity => activity.type === type).length : null}
              loading={activities.isLoading} scope="del piso"
              onPress={() => { setSelectedPoiKey(null); if (!activities.isLoading) activities.refresh(); setActivityType(type); }} />)}
          </View>
        </View>
        {activities.error ? <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.description}>{activities.error}</Text>
          <Pressable accessibilityRole="button" onPress={activities.refresh} style={styles.retryButton}>
            <Text style={styles.backText}>Reintentar consulta</Text>
          </Pressable>
        </View> : null}
        <View style={styles.poiSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Puntos de interés ({pois.length})</Text>
          {pois.length ? pois.map(poi => <PointOfInterestBanner key={poi.poiKey} poi={poi}
            onPress={() => setSelectedPoiKey(poi.poiKey)} />) : <View style={styles.emptyCard}>
            <Text style={styles.description}>Este piso no tiene puntos de interés vigentes.</Text>
          </View>}
        </View>
      </>}
      </ActivityContentTransition>
    </RefreshScrollView>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: {
    width: '100%', maxWidth: 980, height: '86%', maxHeight: '90%', backgroundColor: '#FFFFFF',
    borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15,
    shadowRadius: 24, elevation: 10,
  },
  header: { paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  detailHeader: { height: 32 },
  headerText: { paddingHorizontal: 36, gap: 6 },
  title: { textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#0F172A' },
  subtitle: { textAlign: 'center', fontSize: 14, color: '#64748B', lineHeight: 20 },
  closeButton: { position: 'absolute', right: 0, top: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1, marginVertical: 18 },
  compactScroll: { marginVertical: 0 },
  content: { gap: 20, paddingBottom: 4 },
  transitionContent: { gap: 20 },
  overview: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  descriptionColumn: { flexGrow: 1, flexBasis: 240, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  description: { fontSize: 14, lineHeight: 22, color: '#475569' },
  counters: { flexDirection: 'row', flexGrow: 1, flexBasis: 240, gap: 12 },
  errorBox: { gap: 8, borderRadius: 12, backgroundColor: '#FFF7ED', padding: 14 },
  retryButton: { paddingVertical: 8 },
  poiSection: { gap: 12 },
  emptyCard: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 18, padding: 18 },
  backText: { fontSize: 14, color: APP_COLORS.PRIMARY, fontWeight: '600' },
});
