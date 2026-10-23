import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CampusMapViewport } from '@/three/components/CampusMapViewport';
import { FloorInfoModal } from '@/features/activities/components/FloorInfoModal';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMapStore } from '@/three/store/mapStore';
import { ApiClientError } from '@/three/api/mapApi';
import { useLocationActivities } from '@/features/activities/hooks/useLocationActivities';
import { useActivityPreview } from '@/features/activities/hooks/useActivityPreview';

/** Carga el mapa del campus de la sesión y coordina escena, actividades y modal. */
export default function MapScreen() {
  const params = useLocalSearchParams<{ activityId?: string | string[] }>();
  const router = useRouter();
  const auth = useAuth();
  const campusId = auth.identity?.campusId;
  const userId = auth.identity?.userId;
  const accessToken = useRef(auth.session?.access_token);
  accessToken.current = auth.session?.access_token;
  const data = useMapDataStore((state) => state.data);
  const target = useActivityPreview(typeof params.activityId === 'string' ? params.activityId : '', Boolean(params.activityId && data?.campusId === campusId));
  const [locationError, setLocationError] = useState<string | null>(null);
  const activities = useLocationActivities({}, Boolean(data && data.campusId === campusId));
  const selectedFloor = useMapStore(state => state.selectedFloor);
  useEffect(() => {
    if (selectedFloor) activities.refresh();
  }, [selectedFloor, activities.refresh]);
  const error = useMapDataStore((state) => state.error);
  const loadMap = useMapDataStore((state) => state.loadMap);
  const clearMap = useMapDataStore((state) => state.clearMap);
  // Si el backend rechaza la identidad, solicita refrescar sus capacidades actuales.
  const load = () => {
    if (campusId && accessToken.current) void loadMap(campusId, accessToken.current).catch(reason => {
      if (reason instanceof ApiClientError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    });
  };

  useEffect(() => {
    useMapStore.getState().resetBuilding();
    setLocationError(null);
    load();
    return clearMap;
    // El token vigente se lee al solicitar; su rotación no reinicia cámara, piso ni modal.
  }, [loadMap, clearMap, campusId, userId, auth.refreshIdentity]);

  useEffect(() => {
    setLocationError(null);
    if (!target.detail || !data || data.campusId !== campusId) return;
    const activity = target.detail;
    const floor = Object.values(data.floorData).find(value => value.id === activity.location.floorKey
      && value.buildingId === activity.location.buildingKey);
    if (!floor) { setLocationError('La ubicación de esta actividad ya no está disponible en el mapa.'); return; }
    useMapStore.getState().selectBuilding(floor.buildingId);
    useMapStore.getState().selectFloor(floor.meshName);
    router.setParams({ activityId: undefined });
  }, [target.detail, data, campusId, router]);

  if (!data || data.campusId !== campusId) {
    return (
      <View style={styles.screen}>
        <View style={[styles.container, styles.centered]}>
          {!error ? (
            <>
              <ActivityIndicator size={'large'} />
              <Text style={styles.statusText}>Cargando mapa del campus...</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={load} style={styles.retry}>
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </>
          )}
        </View>
        <BottomNavigationBar activeItemId={'map'} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <CampusMapViewport activities={activities} />
        <FloorInfoModal activities={activities} />
        {params.activityId && !target.isLoading && (target.error || locationError) ? <View style={styles.targetNotice}>
          <Text accessibilityRole="alert" style={styles.targetError}>{locationError || target.error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setLocationError(null); target.refresh(); }} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.setParams({ activityId: undefined })} style={styles.retry}><Text style={styles.retryText}>Continuar en el mapa</Text></Pressable>
        </View> : null}
      </View>
      <BottomNavigationBar activeItemId={'map'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },

  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  statusText: {
    marginTop: 12,
  },

  errorText: {
    textAlign: 'center',
    color: '#FFB4AB',
  },
  retry: { marginTop: 16, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 12 },
  retryText: { color: '#09243A', fontWeight: '700' },
  targetNotice: { position: 'absolute', top: 24, left: 16, right: 16, backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, alignItems: 'center' },
  targetError: { color: '#A93226', textAlign: 'center', lineHeight: 20 },
});
