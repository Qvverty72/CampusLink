import { Stack } from 'expo-router';

/** Navigation dedicated to the 3D map and future location detail screens. */
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
