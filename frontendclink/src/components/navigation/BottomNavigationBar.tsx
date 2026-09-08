import type { ReactNode } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export interface BottomNavigationItem {
  id: string;
  label: string;
  /** Replace this later with the final icon component. */
  icon?: ReactNode;
}

interface BottomNavigationBarProps {
  items?: BottomNavigationItem[];
  activeItemId?: string;
  onItemPress?: (itemId: string) => void;
}

export const DEFAULT_BOTTOM_NAVIGATION_ITEMS: BottomNavigationItem[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'map', label: 'Mapa' },
  { id: 'marketplace', label: 'Mercado' },
  { id: 'profile', label: 'Perfil' },
];

/** Horizontal separation between navigation options. */
const NAVIGATION_ITEM_SPACING = 72;

/** Reusable bottom navigation with replaceable placeholder icons. */
export function BottomNavigationBar({
  items = DEFAULT_BOTTOM_NAVIGATION_ITEMS,
  activeItemId,
  onItemPress,
}: BottomNavigationBarProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.bar}>
        {items.map((item) => {
          const isActive = item.id === activeItemId;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              onPress={() => onItemPress?.(item.id)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
            >
              <View style={[styles.iconSlot, isActive && styles.iconSlotActive]}>
                {item.icon ?? (
                  <View
                    style={[
                      styles.iconPlaceholder,
                      isActive && styles.iconPlaceholderActive,
                    ]}
                  />
                )}
              </View>

              <Text style={[styles.label, isActive && styles.labelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#FFFFFF',
  },
  bar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCE4EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 6,
    columnGap: NAVIGATION_ITEM_SPACING,
  },
  item: {
    minHeight: 56,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
  },
  itemPressed: {
    opacity: 0.65,
  },
  iconSlot: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  iconSlotActive: {
    backgroundColor: '#E5F4F4',
  },
  iconPlaceholder: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#8A9AA7',
    borderRadius: 5,
  },
  iconPlaceholderActive: {
    borderColor: '#0B6E75',
    backgroundColor: '#0B6E75',
  },
  label: {
    color: '#718390',
    fontSize: 11,
    fontWeight: '600',
  },
  labelActive: {
    color: '#0B6E75',
    fontWeight: '700',
  },
});
