import { Platform, type DimensionValue } from 'react-native';

/** Conserva el espaciado nativo; Router 58 requiere CSS env para los insets web. */
export function safeAreaInset(
  edge: 'top' | 'bottom' | 'left' | 'right',
  nativeInset: number,
  { min = 0, offset = 0, base = 0 }: { min?: number; offset?: number; base?: number } = {},
): DimensionValue {
  if (Platform.OS !== 'web') return base + Math.max(min, nativeInset + offset);
  return `calc(${base}px + max(${min}px, calc(env(safe-area-inset-${edge}, 0px) + ${offset}px)))` as DimensionValue;
}
