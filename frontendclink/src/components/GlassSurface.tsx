import { BlurView } from 'expo-blur';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { APP_COLORS } from '@/types/colors';

/** Material chosen for the navigation bar, shared by floating map controls. */
export const GLASS_MATERIAL = {
  blurIntensity: 35,
  surfaceTint: 'rgba(255, 255, 255, 0.9)',
} as const;

type GlassSurfaceProps = ViewProps & {
  radius?: number;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Keeps the shadow outside the clipped, decorative blur background. */
export function GlassSurface({ children, radius = 32, style, contentStyle, ...viewProps }: GlassSurfaceProps) {
  return <View {...viewProps} style={[styles.shadow, { borderRadius: radius }, style]}>
    <View style={[styles.surface, { borderRadius: radius }, contentStyle]}>
      <BlurView intensity={GLASS_MATERIAL.blurIntensity} tint="light"
        style={[styles.background, { borderRadius: radius }]} accessible={false} aria-hidden accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" />
      <View style={[styles.background, styles.tint, { borderRadius: radius }]} accessible={false} aria-hidden />
      {children}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  shadow: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: APP_COLORS.PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  surface: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.75)',
  },
  background: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
  tint: { backgroundColor: GLASS_MATERIAL.surfaceTint },
});
