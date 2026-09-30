import { colors } from '@/theme/tokens';
import { Stack } from 'expo-router';

/** Navigation for marketplace listings, product details and transactions. */
export default function MarketplaceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
