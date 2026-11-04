import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useMapStore } from '@/three/store/mapStore';
import { APP_COLORS } from '@/types/colors';
import { GlassSurface } from '@/components/GlassSurface';

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
      <GlassSurface radius={26} contentStyle={styles.content}>
        <Text style={styles.label}>Volver atrás</Text>
      </GlassSurface>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    bottom: 128,
    alignSelf: 'center',
    zIndex: 10,
    borderRadius: 26,
  },
  content: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: APP_COLORS.PRIMARY,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
