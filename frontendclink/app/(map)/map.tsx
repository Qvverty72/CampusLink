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
import { colors } from '@/theme/tokens';
import { useMapDataStore } from '@/three/store/mapDataStore';
import { AppHeader, Button, go } from '@/components/ui';

export default function MapScreen() {
  const data = useMapDataStore((state) => state.data);
  const error = useMapDataStore((state) => state.error);
  const loadMap = useMapDataStore((state) => state.loadMap);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  if (!data) {
    return (
      <View style={styles.container}>
        <AppHeader title="Mapa" />
        <View style={[styles.container, styles.centered]}>
        {!error ? (
          <>
            <ActivityIndicator size="large" color={colors.brandPrimary} />
            <Text style={styles.statusText}>Cargando mapa del campus...</Text>
          </>
        ) : (
          <>
            <Text accessibilityRole="alert" style={styles.errorText}>
              No se pudo cargar el mapa del campus. Revisa la conexión e inténtalo nuevamente.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void loadMap()} style={styles.retry}>
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </>
        )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title="Mapa" />
      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Button secondary label="Actividades del campus (mock)" onPress={() => go('/activities')} />
      </View>
      <CampusMapViewport />

      <FloorInfoModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  statusText: {
    marginTop: 12,
    color: colors.textSecondary,
  },

  errorText: {
    textAlign: 'center',
    color: colors.error,
  },
  retry: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
  },
  retryText: { color: colors.onBrand, fontWeight: '600' },
});
