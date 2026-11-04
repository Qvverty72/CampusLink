import { Stack } from 'expo-router';

/** Navegación de los paneles analíticos y sus vistas de detalle. */
export default function AnalyticsLayout() {
  return (
    <Stack
      screenOptions={{
        gestureEnabled: false,
        headerShown: false,
        headerStyle: { backgroundColor: '#FFFFFF' },
        headerTintColor: '#002E56',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#F4F7F9' },
      }}
    />
  );
}
