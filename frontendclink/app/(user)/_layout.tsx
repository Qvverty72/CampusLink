import { Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { canManageAccess } from '@/features/users/access';

/** Navigation for welcome, authentication, account and profile screens. */
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
        <Stack.Screen name="notifications" />
      </Stack.Protected>
      <Stack.Protected guard={auth.status === 'ready' && canManageAccess(auth.identity?.roles ?? [])}>
        <Stack.Screen name="access" />
        <Stack.Screen name="audit" />
      </Stack.Protected>
    </Stack>
  );
}
