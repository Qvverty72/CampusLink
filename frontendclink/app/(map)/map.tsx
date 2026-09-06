import { StyleSheet, View } from 'react-native';
import { CampusMap } from '@/three/components/CampusMap';
import { FloorInfoModal } from '@/three/components/FloorInfoModal';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <CampusMap />
      <FloorInfoModal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
