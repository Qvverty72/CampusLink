import { Stack } from 'expo-router';

/** Navegación de bienvenida, autenticación, cuenta y perfil. */
export default function LoginLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: '#F4F7F9' },
      }}
    />
  );
}
