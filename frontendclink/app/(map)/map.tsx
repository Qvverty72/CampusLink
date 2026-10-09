import { useEffect } from 'react';
import {
  ActivityIndicator,
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

export default function MapScreen() {
  const campusId = useAuth().identity?.campusId;
  const data = useMapDataStore((state) => state.data);
  const error = useMapDataStore((state) => state.error);
  const loadMap = useMapDataStore((state) => state.loadMap);

  useEffect(() => {
    useMapStore.getState().resetBuilding();
    if (campusId) void loadMap(campusId);
  }, [loadMap, campusId]);

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
            <Text style={styles.errorText}>
              {error ?? 'No se pudo cargar el mapa del campus.'}
            </Text>
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
  },
});
