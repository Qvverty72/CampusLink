/** Native floor information and activities browser; map stores supply selection only. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMapStore } from '@/three/store/mapStore';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { activityLocations } from '@/three/api/activityLocations';
import type { RuntimeMapData } from '@/three/api/mapApi';
import type { FloorDefinition } from '@/three/types/map';
import { PointOfInterestDetail } from '@/three/components/PointOfInterestDetail';
import { PointOfInterestBanner } from '@/three/components/PointOfInterestBanner';
import { LocationActivities } from './LocationActivities';
import { ActivityContentTransition } from './ActivityContentTransition';
import type { ActivitiesState } from '../hooks/useLocationActivities';
import { ACTIVITY_COLORS, filterLocationActivities, type Activity } from '../types/activity';

const ACTIVITY_TYPES = ['OFFICIAL_EVENT', 'COMMUNITY_ACTIVITY'] as const;
const TYPE_LABELS = {
  OFFICIAL_EVENT: 'Eventos oficiales', COMMUNITY_ACTIVITY: 'Actividades comunitarias',
};

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
  const scroll = useRef<ScrollView>(null);
  const query = { buildingKey: floor.buildingId, floorKey: floor.id };
  const entries = filterLocationActivities(activities.activities, query);
  const hasCounts = !activities.isLoading && !activities.error;
  const pois = (floor.pois ?? []).filter(poi => poi.isVisible === true && !poi.deletedAt);
  // Resolve from the current floor rather than retaining a stale POI object.
  const selectedPoi = pois.find(poi => poi.poiKey === selectedPoiKey);
  const viewKey = selectedPoi ? `poi:${selectedPoi.poiKey}` : activityType ?? 'floor-information';
  useEffect(() => {
    if (selectedPoiKey && !selectedPoi) setSelectedPoiKey(null);
  }, [selectedPoiKey, selectedPoi]);
  useLayoutEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [viewKey]);

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text accessibilityRole="header" style={styles.title}>{selectedPoi ? 'Información del punto de interés' : activityType ? 'Detalle de actividades' : 'Información del piso'}</Text>
        <Text style={styles.subtitle}>{floor.name}</Text>
      </View>
      <Pressable onPress={onClose} accessibilityRole="button"
        accessibilityLabel={selectedPoi ? 'Cerrar información del punto de interés' : 'Cerrar información del piso'} hitSlop={12} style={styles.closeButton}>
        <Text style={styles.closeIcon}>✕</Text>
      </Pressable>
    </View>
    <ScrollView ref={scroll} style={styles.scroll}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ActivityContentTransition transitionKey={viewKey} style={styles.transitionContent}>
      {selectedPoi ? <PointOfInterestDetail key={selectedPoi.poiKey} poi={selectedPoi}
        buildingName={map.buildingConfigs[floor.buildingId].name} floorName={floor.name}
        onBack={() => setSelectedPoiKey(null)} /> : activityType ? <>
        <LocationActivities key={activityType} state={activities} query={query}
          activityType={activityType} locations={activityLocations(map)} onBackToFloorInfo={() => setActivityType(null)} />
      </> : <>
        <View style={styles.overview}>
          <View style={styles.descriptionColumn}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Descripción del piso</Text>
            <Text style={styles.description}>{floor.description?.trim() || 'Este piso aún no tiene una descripción.'}</Text>
          </View>
          <View style={styles.counters}>
            {ACTIVITY_TYPES.map(type => {
              const count = entries.filter(activity => activity.type === type).length;
              const color = ACTIVITY_COLORS[type];
              return <TouchableOpacity key={type} accessibilityRole="button" activeOpacity={0.75}
                accessibilityLabel={`${TYPE_LABELS[type]}${hasCounts ? `: ${count}` : ''}. Ver actividades del piso`}
                onPress={() => { setSelectedPoiKey(null); activities.refresh(); setActivityType(type); }}
                style={styles.counter}>
                <View style={[styles.countBadge, { borderColor: color }]}>
                  {activities.isLoading ? <ActivityIndicator color={color} />
                    : <Text style={[styles.count, { color }]}>{hasCounts ? count : '—'}</Text>}
                </View>
                <Text style={[styles.counterLabel, { color }]}>{TYPE_LABELS[type]}</Text>
                <Text style={styles.counterHint}>Ver actividades</Text>
              </TouchableOpacity>;
            })}
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
    </ScrollView>
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
  headerText: { paddingHorizontal: 36, gap: 6 },
  title: { textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#0F172A' },
  subtitle: { textAlign: 'center', fontSize: 14, color: '#64748B', lineHeight: 20 },
  closeButton: { position: 'absolute', right: 0, top: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  closeIcon: { fontSize: 16, color: '#475569' },
  scroll: { flex: 1, marginVertical: 18 },
  content: { gap: 20, paddingBottom: 4 },
  transitionContent: { gap: 20 },
  overview: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  descriptionColumn: { flexGrow: 1, flexBasis: 240, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  description: { fontSize: 14, lineHeight: 22, color: '#475569' },
  counters: { flexDirection: 'row', flexGrow: 1, flexBasis: 240, gap: 12 },
  counter: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, padding: 10, borderRadius: 16, backgroundColor: '#F8FAFC' },
  countBadge: { alignSelf: 'center', width: 48, height: 48, borderRadius: 24, borderWidth: 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 20, fontWeight: '700' },
  counterLabel: { width: '100%', minHeight: 40, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  counterHint: { width: '100%', fontSize: 12, color: '#64748B', textAlign: 'center' },
  errorBox: { gap: 8, borderRadius: 12, backgroundColor: '#FFF7ED', padding: 14 },
  retryButton: { paddingVertical: 8 },
  poiSection: { gap: 12 },
  emptyCard: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 18, padding: 18 },
  backText: { fontSize: 14, color: '#0B6E75', fontWeight: '600' },
});
