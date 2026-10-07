import { Stack } from 'expo-router';

/** Navigation for physical goods listings, product details and transactions. */
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
