import '../src/global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { AuthProvider } from '@/features/auth/AuthProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar barStyle={'light-content'} />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          contentStyle: { backgroundColor: '#071A2B' },
        }}
      >
        <Stack.Screen name={'(analytics)'} options={{ animation: 'fade' }} />
        <Stack.Screen name={'(login)'} options={{ animation: 'fade' }} />
        <Stack.Screen name={'(map)'} options={{ animation: 'fade' }} />
        <Stack.Screen name={'(marketplace)'} options={{ animation: 'fade' }} />
        <Stack.Screen name={'(reports)'} options={{ animation: 'fade' }} />
        <Stack.Screen name={'(user)'} options={{ animation: 'fade' }} />
      </Stack>
    </AuthProvider>
  );
}
