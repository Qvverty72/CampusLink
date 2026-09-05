import '../src/global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';

export default function RootLayout() {
  return (
    <>
      <StatusBar barStyle="light-content" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#071A2B' },
        }}
      >
        <Stack.Screen name="(user)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(map)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(marketplace)" />
      </Stack>
    </>
  );
}
