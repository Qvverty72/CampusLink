import { StyleSheet, View } from 'react-native';
import { BuildingCloseButton } from '@/three/components/BuildingCloseButton';
import { CampusMap } from '@/three/components/CampusMap';

/** Map viewport and its floating controls. */
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
