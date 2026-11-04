import { Stack } from 'expo-router';

/** Navegación para denuncias y sus vistas de detalle. */
export default function ReportsLayout() {
  return (
    <Stack
      screenOptions={{
        gestureEnabled: false,
        headerShown: false,
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerTintColor: '#09243A',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#F4F7F9' },
      }}
    />
  );
}
