import { StyleSheet, View } from 'react-native';
import { CampusMap } from '@/components/map/CampusMap';
import { FloorInfoModal } from '@/components/map/FloorInfoModal';

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
