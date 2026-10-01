import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/theme/tokens';

export type NavigationTileIcon = 'marketplace' | 'requests' | 'transactions' | 'resources' | 'activities';
export type NavigationTileState = 'default' | 'success' | 'warning' | 'info';

type NavigationTileProps = {
  icon: NavigationTileIcon;
  title: string;
  subtitle: string;
  badge?: string;
  state?: NavigationTileState;
  showChevron?: boolean;
  onPress: () => void;
  variant?: 'compact' | 'wide';
  style?: StyleProp<ViewStyle>;
};

const stateColors: Record<NavigationTileState, string> = {
  default: colors.brandPrimary,
  success: colors.success,
  warning: colors.warning,
  info: colors.info,
};

function Chevron() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron} />;
}

function TileIcon({ name }: { name: NavigationTileIcon }) {
  const drawing: Record<NavigationTileIcon, ReactNode> = {
    marketplace: <>
      <View style={styles.shopAwning}><View style={styles.shopStripe} /><View style={styles.shopStripe} /><View style={styles.shopStripe} /></View>
      <View style={styles.shopBody}><View style={styles.shopDoor} /></View>
    </>,
    requests: <>
      <View style={styles.clipboard}><View style={styles.clipboardClip} /><View style={styles.clipboardLine} /><View style={[styles.clipboardLine, styles.shortLine]} /></View>
    </>,
    transactions: <>
      <View style={[styles.transferLine, styles.transferTop]}><View style={[styles.arrowHead, styles.arrowRight]} /></View>
      <View style={[styles.transferLine, styles.transferBottom]}><View style={[styles.arrowHead, styles.arrowLeft]} /></View>
    </>,
    resources: <>
      <View style={[styles.bookPage, styles.bookLeft]} /><View style={[styles.bookPage, styles.bookRight]} /><View style={styles.bookSpine} />
    </>,
    activities: <>
      <View style={styles.calendar}><View style={styles.calendarHeader} /><View style={styles.calendarBindingLeft} /><View style={styles.calendarBindingRight} /><View style={styles.calendarMark} /></View>
    </>,
  };

  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.iconFrame}>{drawing[name]}</View>;
}

export function NavigationTile({
  icon,
  title,
  subtitle,
  badge,
  state = 'default',
  showChevron = false,
  onPress,
  variant = 'compact',
  style,
}: NavigationTileProps) {
  const badgeContent = badge && <View style={[styles.badge, variant === 'compact' && styles.compactBadge]}>
    <View style={[styles.statusDot, { backgroundColor: stateColors[state] }]} />
    <Text style={[styles.badgeText, { color: stateColors[state] }]}>{badge}</Text>
  </View>;

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={subtitle}
    onPress={onPress}
    style={({ pressed }) => [styles.tile, variant === 'compact' ? styles.compact : styles.wide, style, pressed && styles.pressed]}
  >
    {variant === 'compact' ? <>
      <View style={styles.compactTop}><TileIcon name={icon} />{badgeContent}{showChevron && !badge && <Chevron />}</View>
      <View style={styles.compactCopy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </> : <>
      <TileIcon name={icon} />
      <View style={styles.wideCopy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {badgeContent}
      </View>
      {showChevron && <Chevron />}
    </>}
  </Pressable>;
}

const styles = StyleSheet.create({
  tile: { minWidth: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  compact: { flex: 1, minHeight: 168, padding: 14, justifyContent: 'space-between', gap: 14 },
  wide: { minHeight: 108, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.62 },
  compactTop: { minHeight: 40, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6 },
  compactCopy: { gap: 4 },
  wideCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 3 },
  title: { color: colors.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  badge: { maxWidth: '100%', minHeight: 24, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: 5 },
  compactBadge: { marginLeft: 'auto' },
  badgeText: { flexShrink: 1, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  iconFrame: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 9, height: 9, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.textSecondary, transform: [{ rotate: '45deg' }], marginRight: 3 },
  shopAwning: { width: 22, height: 7, borderWidth: 2, borderColor: colors.brandPrimary, borderBottomWidth: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, flexDirection: 'row', overflow: 'hidden' },
  shopStripe: { flex: 1, borderRightWidth: 1, borderRightColor: colors.brandPrimary },
  shopBody: { width: 19, height: 13, borderWidth: 2, borderTopWidth: 0, borderColor: colors.brandPrimary, alignItems: 'flex-end', justifyContent: 'flex-end' },
  shopDoor: { width: 5, height: 8, borderLeftWidth: 1, borderColor: colors.brandPrimary },
  clipboard: { width: 18, height: 22, borderWidth: 2, borderColor: colors.brandPrimary, borderRadius: 3, paddingTop: 7, paddingHorizontal: 3, gap: 3 },
  clipboardClip: { position: 'absolute', top: -3, left: 4, width: 7, height: 5, borderWidth: 2, borderColor: colors.brandPrimary, borderRadius: 2, backgroundColor: colors.surfaceElevated },
  clipboardLine: { height: 2, width: 8, backgroundColor: colors.brandPrimary, borderRadius: 1 },
  shortLine: { width: 6 },
  transferLine: { position: 'absolute', width: 21, height: 2, backgroundColor: colors.brandPrimary },
  transferTop: { top: 14, left: 9 },
  transferBottom: { top: 24, right: 9 },
  arrowHead: { position: 'absolute', width: 7, height: 7, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.brandPrimary },
  arrowRight: { right: 0, top: -3, transform: [{ rotate: '45deg' }] },
  arrowLeft: { left: 0, top: -3, transform: [{ rotate: '225deg' }] },
  bookPage: { position: 'absolute', top: 10, width: 11, height: 20, borderWidth: 2, borderColor: colors.brandPrimary },
  bookLeft: { left: 9, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  bookRight: { right: 9, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  bookSpine: { position: 'absolute', top: 10, width: 2, height: 20, backgroundColor: colors.brandPrimary },
  calendar: { width: 22, height: 21, borderWidth: 2, borderColor: colors.brandPrimary, borderRadius: 3 },
  calendarHeader: { position: 'absolute', top: 5, left: 0, right: 0, height: 2, backgroundColor: colors.brandPrimary },
  calendarBindingLeft: { position: 'absolute', top: -4, left: 4, width: 2, height: 7, borderRadius: 1, backgroundColor: colors.brandPrimary },
  calendarBindingRight: { position: 'absolute', top: -4, right: 4, width: 2, height: 7, borderRadius: 1, backgroundColor: colors.brandPrimary },
  calendarMark: { position: 'absolute', left: 6, top: 11, width: 7, height: 4, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.brandPrimary, transform: [{ rotate: '-45deg' }] },
});
