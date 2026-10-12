import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import type { ActivitiesState } from '@/features/activities/hooks/useLocationActivities';
import { LocationActivities } from '@/features/activities/components/LocationActivities';
import { ActivityRefreshScrollView } from './ActivityRefreshScrollView';
import { filterLocationActivities, type Activity } from '@/features/activities/types/activity';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { useMapStore } from '@/three/store/mapStore';
import { activityLocations } from '@/three/api/activityLocations';
import { ACTIVITY_TYPES, ActivityTypeCounter } from './ActivityTypeCounter';

/** Native browser bridges domain locations to map selection; it never guesses a GLB node. */
export function MapActivitiesPanel({ state }: { state: ActivitiesState }) {
  const map = useMapDataStore(value => value.data);
  const buildingKey = useMapStore(value => value.selectedBuilding);
  const floorOpen = useMapStore(value => value.isFloorModalOpen);
  const [activityType, setActivityType] = useState<Activity['type'] | null>(null);
  const open = activityType !== null;
  const [detailOpen, setDetailOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const resetScroll = useCallback(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, []);
  useLayoutEffect(resetScroll, [detailOpen, resetScroll]);
  useEffect(() => setActivityType(null), [map?.campusId, buildingKey, floorOpen]);
  const activities = filterLocationActivities(state.activities, { buildingKey: buildingKey ?? undefined });
  const hasSummary = !state.isLoading && !state.error;
  const explore = (activity: Activity) => {
    if (!activity.location.floorKey) {
      setActivityType(null);
      const building = Object.values(map?.buildingConfigs ?? {}).find(value => value.id === activity.location.buildingKey);
      if (building) useMapStore.getState().selectBuilding(building.id);
      else useMapStore.getState().resetBuilding();
      return;
    }
    const floor = Object.values(map?.floorData ?? {}).find(value => value.id === activity.location.floorKey
      && value.buildingId === activity.location.buildingKey);
    if (!floor) return;
    setActivityType(null);
    useMapStore.getState().selectBuilding(floor.buildingId);
    useMapStore.getState().selectFloor(floor.meshName);
  };
  if (!map || floorOpen) return null;
  return <>
    <View pointerEvents="box-none" style={styles.counters}>
      {ACTIVITY_TYPES.map(type => <ActivityTypeCounter key={type} type={type} variant="map"
        count={hasSummary ? activities.filter(activity => activity.type === type).length : null}
        loading={state.isLoading} scope={buildingKey ? 'del edificio' : 'del campus'}
        onPress={() => { if (!state.isLoading) state.refresh(); setActivityType(type); }} />)}
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setActivityType(null)}>
      <View style={styles.overlay}><View style={styles.card}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar actividades" hitSlop={12}
            onPress={() => setActivityType(null)} style={styles.closeIconButton}>
            <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <X size={16} color="#475569" strokeWidth={1.7} />
            </View>
          </Pressable>
        </View>
        <ActivityRefreshScrollView ref={scroll} style={styles.scroll} keyboardShouldPersistTaps="handled">
          {activityType ? <LocationActivities key={`${buildingKey ?? 'campus'}:${activityType}`} state={state}
            activityType={activityType} query={{ buildingKey: buildingKey ?? undefined }} onExplore={explore} locations={activityLocations(map)}
            onDetailVisibilityChange={setDetailOpen} onEditOpen={resetScroll} onPageChange={resetScroll} /> : null}
        </ActivityRefreshScrollView>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  counters: { position: 'absolute', bottom: 128, right: 8, flexDirection: 'column', gap: 8, zIndex: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 980, height: '86%', maxHeight: '90%', padding: 20, borderRadius: 24, backgroundColor: '#FFFFFF' },
  header: { height: 32 },
  closeIconButton: { position: 'absolute', right: 0, top: 0, width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1, marginVertical: 12 },
});
