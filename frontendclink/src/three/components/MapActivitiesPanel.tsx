import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ActivitiesState } from '@/features/activities/hooks/useLocationActivities';
import { LocationActivities } from '@/features/activities/components/LocationActivities';
import { ACTIVITY_COLORS, filterLocationActivities, type Activity } from '@/features/activities/types/activity';
import { useMapDataStore } from '../store/mapDataStore';
import { useMapStore } from '../store/mapStore';

/** Native browser bridges domain locations to map selection; it never guesses a GLB node. */
export function MapActivitiesPanel({ state }: { state: ActivitiesState }) {
  const map = useMapDataStore(value => value.data);
  const buildingKey = useMapStore(value => value.selectedBuilding);
  const floorOpen = useMapStore(value => value.isFloorModalOpen);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [map?.campusId, buildingKey, floorOpen]);
  const activities = filterLocationActivities(state.activities, { buildingKey: buildingKey ?? undefined });
  const hasSummary = !state.isLoading && !state.error;
  const explore = (activity: Activity) => {
    const floor = Object.values(map?.floorData ?? {}).find(value => value.id === activity.location.floorKey
      && value.buildingId === activity.location.buildingKey);
    if (!floor) return;
    setOpen(false);
    useMapStore.getState().selectBuilding(floor.buildingId);
    useMapStore.getState().selectFloor(floor.meshName);
  };
  if (!map || floorOpen) return null;
  return <>
    <Pressable accessibilityRole="button" onPress={() => { state.refresh(); setOpen(true); }} style={styles.button}>
      <Text style={styles.title}>
        Actividades {buildingKey ? 'del edificio' : 'del campus'}{hasSummary ? ` (${activities.length})` : ''}
      </Text>
      {hasSummary ? <>
        <Text style={{ color: ACTIVITY_COLORS.OFFICIAL_EVENT }}>
          Oficiales: {activities.filter(activity => activity.type === 'OFFICIAL_EVENT').length}
        </Text>
        <Text style={{ color: ACTIVITY_COLORS.COMMUNITY_ACTIVITY }}>
          Comunitarias: {activities.filter(activity => activity.type === 'COMMUNITY_ACTIVITY').length}
        </Text>
      </> : null}
      <Text>{state.isLoading ? 'Cargando actividades…' : state.error ? 'Reintentar consulta' : 'Ver actividades'}</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          {buildingKey ? map.buildingConfigs[buildingKey]?.name : 'Actividades del campus'}
        </Text>
        <ScrollView style={styles.scroll}>
          {open ? <LocationActivities key={buildingKey ?? 'campus'} state={state}
            query={{ buildingKey: buildingKey ?? undefined }} onExplore={explore} /> : null}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.close}><Text style={styles.title}>Volver al mapa</Text></Pressable>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  button: { position: 'absolute', top: 16, right: 16, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, gap: 5, maxWidth: '85%', elevation: 4 },
  title: { fontSize: 16, color: '#0F172A', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, maxHeight: '90%', padding: 20, borderRadius: 16, backgroundColor: '#FFFFFF' },
  scroll: { flexShrink: 1, marginVertical: 12 }, close: { paddingVertical: 12, alignItems: 'center' },
});
