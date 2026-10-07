import { Stack } from 'expo-router';

/** Navigation for welcome, authentication, account and profile screens. */
export default function LoginLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: '#071A2B' },
      }}
    />
  );
}
