import { StyleSheet, View } from 'react-native';

const BASE_SIZE = 24;

interface BottomNavigationIconProps {
  id: string;
  color: string;
  /** Tamaño final del icono en px. El dibujo base es de 24x24 y se escala. */
  size?: number;
}

/** Iconos nativos de contorno, escalables mediante la prop `size`. */
export function BottomNavigationIcon({
  id,
  color,
  size = BASE_SIZE,
}: BottomNavigationIconProps) {
  const stroke = { borderColor: color };
  const scale = size / BASE_SIZE;
  const offset = (size - BASE_SIZE) / 2;

  return (
    <View
      style={{ width: size, height: size }}
      pointerEvents="none"
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Lienzo 24x24 centrado en el contenedor y escalado desde su centro */}
      <View
        style={[
          styles.canvas,
          { left: offset, top: offset, transform: [{ scale }] },
        ]}
      >
        {id === 'home' ? (
          <>
            <View style={[styles.profileHead, stroke]} />
            <View style={[styles.profileShoulders, stroke]} />
          </>
        ) : id === 'map' ? (
          <>
            <View style={[styles.mapPin, stroke]} />
            <View style={[styles.mapCenter, stroke]} />
          </>
        ) : id === 'physicalgoods' ? (
          <>
            <View style={[styles.shopBody, stroke]} />
            <View style={[styles.shopRoof, stroke]} />
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={[styles.shopAwning, stroke, { left: 3 + index * 6 }]}
              />
            ))}
          </>
        ) : id === 'elibrary' ? (
          <>
            <View style={[styles.bookCover, stroke]} />
            <View style={[styles.bookPages, { backgroundColor: color }]} />
          </>
        ) : (
          <View style={[styles.genericIcon, stroke]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', width: BASE_SIZE, height: BASE_SIZE },
  profileHead: {
    position: 'absolute', width: 8, height: 8, top: 2, left: 8,
    borderWidth: 1.7, borderRadius: 4,
  },
  profileShoulders: {
    position: 'absolute', width: 18, height: 9, top: 14, left: 3,
    borderWidth: 1.7, borderBottomWidth: 0,
    borderTopLeftRadius: 9, borderTopRightRadius: 9,
  },
  mapPin: {
    position: 'absolute', width: 16, height: 16, left: 4, top: 2,
    borderWidth: 1.7, borderRadius: 9, borderBottomRightRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  mapCenter: {
    position: 'absolute', width: 5, height: 5, top: 7.5, left: 9.5,
    borderWidth: 1.5, borderRadius: 2.5,
  },
  shopBody: {
    position: 'absolute', width: 18, height: 15, left: 3, top: 7,
    borderWidth: 1.7, borderRadius: 2,
  },
  shopRoof: {
    position: 'absolute', width: 16, height: 5, left: 4, top: 3,
    borderWidth: 1.7, borderBottomWidth: 0,
    borderTopLeftRadius: 2, borderTopRightRadius: 2,
  },
  shopAwning: {
    position: 'absolute', width: 6, height: 5, top: 6,
    borderWidth: 1.7, borderTopWidth: 0,
    borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  bookCover: {
    position: 'absolute', width: 16, height: 21, top: 1, left: 4,
    borderWidth: 1.7, borderRadius: 1.5,
  },
  bookPages: {
    position: 'absolute', width: 13, height: 1.7, top: 18, left: 5.5,
    borderRadius: 1,
  },
  genericIcon: {
    position: 'absolute', width: 16, height: 16, top: 4, left: 4,
    borderWidth: 1.7, borderRadius: 5,
  },
});