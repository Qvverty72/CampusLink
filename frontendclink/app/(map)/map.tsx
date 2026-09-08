import { StyleSheet, View } from 'react-native';
import { CampusMapViewport } from '@/three/components/CampusMapViewport';
import { FloorInfoModal } from '@/three/components/FloorInfoModal';
import { BottomNavigationBar } from '@/components/navigation/BottomNavigationBar';

export default function MapScreen() {
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
});
