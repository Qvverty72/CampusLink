import { StyleSheet, View } from 'react-native';
import { BuildingCloseButton } from '@/three/components/BuildingCloseButton';
import { CampusMap } from '@/three/components/CampusMap';

/**
 * Superpone controles React Native sobre el Canvas sin introducirlos en la escena.
 * El botón puede responder como UI 2D mientras `CampusMap` conserva todo el espacio 3D.
 */
export function CampusMapViewport() {
  return (
    <View style={styles.container}>
      <CampusMap />
      <BuildingCloseButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
});
