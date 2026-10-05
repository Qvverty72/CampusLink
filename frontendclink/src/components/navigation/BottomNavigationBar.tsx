import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';

export const DEFAULT_BOTTOM_NAVIGATION_ITEMS = [
  { id: 'home', label: 'Inicio', href: '/' },
  { id: 'map', label: 'Mapa', href: '/map' },
  { id: 'marketplace', label: 'Marketplace', href: '/marketplace' },
  { id: 'library', label: 'Biblioteca', href: '/library' },
] as const;

export function BottomNavigationBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, 6) },
      ]}
    >
      <View style={styles.bar} accessibilityRole="tablist">
        {DEFAULT_BOTTOM_NAVIGATION_ITEMS.map((item) => {
          const selected =
            item.href === pathname ||
            pathname.startsWith(`/detail/${item.id}/`);

          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              hitSlop={{ top: 2, bottom: 2 }}
              onPress={() => {
                if (!selected) {
                  router.replace(item.href as Href);
                }
              }}
              style={({ pressed }) => [
                styles.item,
                selected && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.9}
                numberOfLines={1}
                style={[
                  styles.label,
                  selected && styles.activeLabel,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  bar: {
    width: '100%',
    boxSizing: 'border-box',
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingHorizontal: 4,
    paddingTop: 4,
  },

  item: {
    flexBasis: '25%',
    maxWidth: '25%',
    flexGrow: 0,
    flexShrink: 0,

    minHeight: 50,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 2,
    borderRadius: 12,
  },

  selected: {
    backgroundColor: colors.surfaceElevated,
  },

  pressed: {
    opacity: 0.65,
  },

  label: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  activeLabel: {
    color: colors.brandPrimary,
    fontWeight: '700',
  },
});
