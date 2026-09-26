import { useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CampusMapViewport } from '@/three/components/CampusMapViewport';
import { FloorInfoModal } from '@/three/components/FloorInfoModal';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';
import { useMapDataStore } from '@/three/store/mapDataStore';

export default function MapScreen() {
  const data = useMapDataStore((state) => state.data);
  const error = useMapDataStore((state) => state.error);
  const loadMap = useMapDataStore((state) => state.loadMap);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  if (!data) {
    return (
      <View style={[styles.container, styles.centered]}>
        {!error ? (
          <>
            <ActivityIndicator size="large" />
            <Text style={styles.statusText}>Cargando mapa del campus...</Text>
          </>
        ) : (
          <Text style={styles.errorText}>
            {error ?? 'No se pudo cargar el mapa del campus.'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CampusMapViewport />

      <BottomNavigationBar activeItemId="map" />
      <FloorInfoModal />
    </View>
  );
}

const styles = StyleSheet.create({
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
