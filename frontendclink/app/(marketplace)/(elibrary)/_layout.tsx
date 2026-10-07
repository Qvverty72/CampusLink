import { Stack } from 'expo-router';

/** Navigation for the digital library and its future resource flows. */
export default function ELibraryLayout() {
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
