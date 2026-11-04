import { Stack } from 'expo-router';

/** Navegación de publicaciones de bienes físicos, detalles y transacciones. */
export default function PhysicalGoodsLayout() {
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
