import { colors } from '@/theme/tokens';
import { Stack } from 'expo-router';

/** Navigation for welcome, authentication, account and profile screens. */
export default function UserLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
