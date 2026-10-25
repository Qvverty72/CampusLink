import type { ReactNode } from 'react';
import { safeAreaInset } from '@/lib/layout/safeArea';
import { GlassSurface } from '@/components/GlassSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { APP_COLORS } from '@/types/colors';
import { BottomNavigationIcon } from './BottomNavigationIcon';
import { router, type Href, usePathname } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

export interface BottomNavigationItem {
  id: string;
  label: string;
  href?: Href;
  /** Ícono opcional que reemplaza el predeterminado para este elemento. */
  icon?: ReactNode;
}

interface BottomNavigationBarProps {
  items?: BottomNavigationItem[];
  activeItemId?: string;
  onItemPress?: (itemId: string) => void;
}

export const DEFAULT_BOTTOM_NAVIGATION_ITEMS: BottomNavigationItem[] = [
  { id: 'home', label: 'Perfil', href: '/profile' },
  { id: 'map', label: 'Mapa', href: '/map' },
  { id: 'physicalgoods', label: 'Mercado', href: '/physicalgoods' },
  { id: 'elibrary', label: 'Biblioteca', href: '/elibrary' },
];

const OUTER_PADDING = 12; // margen lateral de la píldora
const BAR_PADDING = 4; // margen interno de la píldora
const BAR_MAX_WIDTH = 560;
const BOTTOM_GAP = 8; // separación mínima respecto al borde inferior
const BAR_RADIUS = 32;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Navegación flotante con el desenfoque limitado a la barra redondeada. */
export function BottomNavigationBar({
  items = DEFAULT_BOTTOM_NAVIGATION_ITEMS,
  activeItemId,
  onItemPress,
}: BottomNavigationBarProps) {
  const auth = useAuth();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const visibleItems = items.filter(
    (item) =>
      item.id === 'home' ||
      (auth.status === 'ready' && auth.identity?.capabilities.general),
  );

  const currentItemId =
    activeItemId ??
    visibleItems.find(
      (item) => typeof item.href === 'string' && item.href === pathname,
    )?.id;

  // ---- Dimensiones responsivas ----
  const count = Math.max(visibleItems.length, 1);
  const barWidth = Math.min(width - OUTER_PADDING * 2, BAR_MAX_WIDTH);
  const slot = (barWidth - BAR_PADDING * 2) / count;

  const iconSize = Math.round(clamp(slot * 0.3, 22, 30));
  const circleSize = Math.round(iconSize * 1.6);
  const labelSize = Math.round(clamp(slot * 0.12, 11, 13));

  const handleItemPress = (item: BottomNavigationItem) => {
    if (typeof item.href === 'string' && item.href === pathname) {
      return;
    }

    if (onItemPress) {
      onItemPress(item.id);
      return;
    }

    if (item.href) {
      router.replace(item.href);
    }
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: safeAreaInset('bottom', insets.bottom, { min: BOTTOM_GAP }) }]}
      pointerEvents="box-none">
      <GlassSurface
        radius={BAR_RADIUS}
        style={{ width: barWidth }}
        contentStyle={styles.bar}
        accessibilityRole="tablist"
        accessibilityLabel="Navegación principal"
      >
        {visibleItems.map((item) => {
          const isActive = item.id === currentItemId;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
              aria-selected={isActive}
              onPress={() => handleItemPress(item)}
              style={({ pressed }) => [
                styles.item,
                { width: slot },
                pressed && styles.itemPressed,
              ]}
            >
              <View
                style={[
                  styles.iconSlot,
                  {
                    width: circleSize,
                    height: circleSize,
                    borderRadius: circleSize / 2,
                  },
                  isActive && styles.iconSlotActive,
                ]}
              >
                {item.icon ?? (
                  <BottomNavigationIcon
                    id={item.id}
                    size={iconSize}
                    color={isActive ? '#FFFFFF' : '#64748B'}
                  />
                )}
              </View>

              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[
                  styles.label,
                  { fontSize: labelSize },
                  isActive && styles.labelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: OUTER_PADDING,
    paddingTop: 8,
  },
  bar: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: BAR_PADDING,
    paddingVertical: 6,
  },
  item: {
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  itemPressed: {
    opacity: 0.65,
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotActive: {
    backgroundColor: APP_COLORS.PRIMARY,
  },
  label: {
    color: APP_COLORS.SECONDARY,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: '100%',
  },
  labelActive: {
    color: APP_COLORS.PRIMARY,
    fontWeight: '600',
  },
});
