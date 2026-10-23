import { Stack } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { canManageAccess } from '@/features/users/types/access';

/** Limita las rutas de cuenta y administración según sesión, capacidades y roles. */
export default function UserLayout() {
  const auth = useAuth();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: '#071A2B' },
      }}
    >
      <Stack.Screen name="profile" />
      <Stack.Protected guard={!!auth.identity?.capabilities.general}>
        <Stack.Screen name="personal" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="notifications" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
      </Stack.Protected>
      <Stack.Protected guard={auth.status === 'ready' && canManageAccess(auth.identity?.roles ?? [])}>
        <Stack.Screen name="access" />
        <Stack.Screen name="audit" />
      </Stack.Protected>
    </Stack>
  );
}
