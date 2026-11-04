import { Stack } from 'expo-router';

/** Navegación compartida por bienes físicos y biblioteca digital. */
export default function MarketplaceLayout() {
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
    >
      <Stack.Screen name={'(physicalgoods)'} options={{ animation: 'fade' }} />
      <Stack.Screen name={'(elibrary)'} options={{ animation: 'fade' }} />
    </Stack>
  );
}
