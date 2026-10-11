import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useMapStore } from '@/three/store/mapStore';
import { APP_COLORS } from '@/types/colors';

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
      accessibilityLabel="Volver atrás"
      accessibilityHint="Regresa a la vista general del campus"
      activeOpacity={0.78}
      hitSlop={10}
      onPress={resetBuilding}
      style={styles.button}
    >
      <Text style={styles.label}>Volver atrás</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    zIndex: 10,
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: APP_COLORS.SECONDARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 7,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
