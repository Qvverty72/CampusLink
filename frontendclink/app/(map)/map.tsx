import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CampusMapViewport } from '@/three/components/CampusMapViewport';
import { FloorInfoModal } from '@/three/components/FloorInfoModal';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMapStore } from '@/three/store/mapStore';
import { ApiClientError } from '@/three/api/mapApi';

export default function MapScreen() {
  const auth = useAuth();
  const campusId = auth.identity?.campusId;
  const accessToken = auth.session?.access_token;
  const data = useMapDataStore((state) => state.data);
  const error = useMapDataStore((state) => state.error);
  const loadMap = useMapDataStore((state) => state.loadMap);
  const clearMap = useMapDataStore((state) => state.clearMap);
  const load = () => {
    if (campusId && accessToken) void loadMap(campusId, accessToken).catch(reason => {
      if (reason instanceof ApiClientError && [401, 403].includes(reason.status)) auth.refreshIdentity();
    });
  };

  useEffect(() => {
    useMapStore.getState().resetBuilding();
    load();
    return clearMap;
  }, [loadMap, clearMap, campusId, accessToken, auth.refreshIdentity]);

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
        <CampusMapViewport />
        <FloorInfoModal />
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
});
