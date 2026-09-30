import { colors } from '@/theme/tokens';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useMapStore } from '@/three/store/mapStore';

/**
 * Control 2D para abandonar la selección actual.
 * `resetBuilding` colapsa los pisos mediante Zustand y, al mismo tiempo, dispara en
 * CameraController la transición de regreso al encuadre general.
 */
export function BuildingCloseButton() {
  const selectedBuilding = useMapStore((state) => state.selectedBuilding);
  const resetBuilding = useMapStore((state) => state.resetBuilding);

  if (!selectedBuilding) {
    return null;
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Cerrar edificio y volver al mapa completo"
      accessibilityHint="Regresa a la vista general del campus"
      activeOpacity={0.78}
      hitSlop={10}
      onPress={resetBuilding}
      style={styles.button}
    >
      <View pointerEvents="none" style={styles.closeIcon}>
        <View style={[styles.closeIconLine, styles.closeIconLineForward]} />
        <View style={[styles.closeIconLine, styles.closeIconLineBackward]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    zIndex: 10,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  closeIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconLine: {
    position: 'absolute',
    width: 20,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.onBrand,
  },
  closeIconLineForward: {
    transform: [{ rotate: '45deg' }],
  },
  closeIconLineBackward: {
    transform: [{ rotate: '-45deg' }],
  },
});
