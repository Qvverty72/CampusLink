import '../src/global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { AuthProvider } from '@/features/auth/components/AuthProvider';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { canAccessAnalytics } from '@/features/analytics/types/access';
import { canManageAccess } from '@/features/users/types/access';

/** Instala el proveedor de autenticación antes de montar las rutas de Expo Router. */
export default function RootLayout() {
  return <AuthProvider><AppNavigation /></AuthProvider>;
}

/** Restringe pantallas según el estado de sesión y las capacidades actuales. */
function AppNavigation() {
  const auth = useAuth();
  const ready = auth.status === 'ready';
  const capabilities = ready ? auth.identity?.capabilities : undefined;
  return (
    <>
      <StatusBar barStyle={'light-content'} />
      <Stack
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          contentStyle: { backgroundColor: '#071A2B' },
        }}
      >
        <Stack.Screen name={'(login)'} options={{ animation: 'fade' }} />
        <Stack.Screen name="index" />
        <Stack.Protected guard={ready}>
          <Stack.Screen name={'(user)'} options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(capabilities?.general)}>
          <Stack.Screen name={'(map)'} options={{ animation: 'fade' }} />
          <Stack.Screen name={'(marketplace)'} options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={ready && canAccessAnalytics(auth.identity)}>
          <Stack.Screen name={'(analytics)'} options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={ready && canManageAccess(auth.identity?.roles ?? [])}>
          <Stack.Screen name={'(reports)'} options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
