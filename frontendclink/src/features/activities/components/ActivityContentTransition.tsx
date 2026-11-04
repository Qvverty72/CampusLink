import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

/** Transiciona el contenido dentro del modal estable sin animar el layout ni retrasar consultas. */
export function ActivityContentTransition({ transitionKey, children, style }: {
  transitionKey: string; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const [progress] = useState(() => new Animated.Value(1));
  // Mantiene el contenido visible hasta conocer la preferencia; la apertura inicial usa el fade del modal.
  const canAnimate = useRef(false);
  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const update = (reduced: boolean) => {
      if (!active) return;
      canAnimate.current = !reduced;
      if (reduced) { progress.stopAnimation(); progress.setValue(1); }
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      preferenceChanged = true;
      update(reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!preferenceChanged) update(reduced);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, [progress]);

  useLayoutEffect(() => {
    progress.stopAnimation();
    if (!canAnimate.current) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 180,
      easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web', isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [transitionKey, progress]);

  return <Animated.View style={[style, { opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
    {children}
  </Animated.View>;
}
