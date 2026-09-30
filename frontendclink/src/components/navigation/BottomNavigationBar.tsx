import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

export const DEFAULT_BOTTOM_NAVIGATION_ITEMS = [
  { id: 'home', label: 'Inicio', href: '/' },
  { id: 'map', label: 'Mapa', href: '/map' },
  { id: 'marketplace', label: 'Marketplace', href: '/marketplace' },
  { id: 'library', label: 'Biblioteca', href: '/library' },
] as const;

/** One navigation bar for every existing route, including map error/loading. */
export function BottomNavigationBar() {
  const pathname = usePathname();
  return (
    <View style={styles.safeArea}>
      <View style={styles.bar} accessibilityRole="tablist">
        {DEFAULT_BOTTOM_NAVIGATION_ITEMS.map((item) => {
          const selected = item.href === pathname || pathname.startsWith(`/detail/${item.id}/`);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => {
                if (item.href && !selected) router.replace(item.href as Href);
              }}
              style={({ pressed }) => [styles.item, selected && styles.selected, pressed && styles.pressed]}
            >
              <Text style={[styles.label, selected && styles.active]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.surface },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, padding: 4 },
  item: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  selected: { backgroundColor: colors.surfaceElevated },
  pressed: { opacity: 0.7 },
  label: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', fontWeight: '600' },
  active: { color: colors.brandPrimary, fontWeight: '700' },
});
