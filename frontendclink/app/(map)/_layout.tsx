import { Stack } from 'expo-router';

/** Navegación dedicada al mapa 3D y vistas de ubicación. */
export default function MapLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        gestureEnabled: false,
        fullScreenGestureEnabled: false,
        contentStyle: { backgroundColor: '#000' },
      }}
    />
  );
}
