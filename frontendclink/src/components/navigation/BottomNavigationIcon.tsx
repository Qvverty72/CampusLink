import { View } from 'react-native';
import { Book, LayoutGrid, MapPin, Store, UserRound, type LucideIcon } from 'lucide-react-native';

const BASE_SIZE = 24;

const NAVIGATION_ICONS = new Map<string, LucideIcon>([
  ['home', UserRound],
  ['map', MapPin],
  ['physicalgoods', Store],
  ['elibrary', Book],
]);

interface BottomNavigationIconProps {
  id: string;
  color: string;
  /** Final icon size in logical pixels. Defaults to 24. */
  size?: number;
}

/** Lucide icons are decorative; the navigation tab provides its accessible label. */
export function BottomNavigationIcon({
  id,
  color,
  size = BASE_SIZE,
}: BottomNavigationIconProps) {
  const Icon = NAVIGATION_ICONS.get(id) ?? LayoutGrid;

  return (
    <View
      style={{ width: size, height: size, pointerEvents: 'none' }}
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon size={size} color={color} strokeWidth={1.7} />
    </View>
  );
}
