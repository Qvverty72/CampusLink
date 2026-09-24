import { StyleSheet, View } from 'react-native';
import { CampusMapViewport } from '@/three/components/CampusMapViewport';
import { FloorInfoModal } from '@/three/components/FloorInfoModal';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      {/* El viewport contiene Canvas y controles del edificio. Navegación y modal
          permanecen como overlays nativos, fuera del árbol de Three.js. */}
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
});
