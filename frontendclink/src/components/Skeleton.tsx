import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View,
  type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

/** Shared loading surface: one pulse and accessible announcement per group of placeholders. */
export function Skeleton({ children, label = 'Cargando contenido', style, contentStyle }: {
  children: ReactNode; label?: string; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>;
}) {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    let animation: Animated.CompositeAnimation | undefined;
    const update = (reduced: boolean) => {
      if (!active) return;
      animation?.stop();
      opacity.setValue(1);
      if (reduced) return;
      const config = { duration: 900, useNativeDriver: Platform.OS !== 'web', isInteraction: false };
      animation = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { ...config, toValue: 0.55 }),
        Animated.timing(opacity, { ...config, toValue: 1 }),
      ]));
      animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      preferenceChanged = true;
      update(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) update(reduced);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
      animation?.stop();
      opacity.stopAnimation();
    };
  }, [opacity]);

  return <View style={style} accessible accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityState={{ busy: true }} aria-busy>
    <Animated.View style={[contentStyle, { opacity }]} pointerEvents="none" accessible={false}
      aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </Animated.View>
  </View>;
}

/** A neutral line, circle or rectangle. Combine inside Skeleton to match the final content. */
export function SkeletonBlock({ width = '100%', height = 16, borderRadius = 6, style }: {
  width?: DimensionValue; height?: DimensionValue; borderRadius?: number; style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.block, { width, height, borderRadius }, style]} pointerEvents="none"
    accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}

const styles = StyleSheet.create({ block: { backgroundColor: '#E2E8F0' } });
