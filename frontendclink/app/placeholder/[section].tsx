import { useLocalSearchParams } from 'expo-router';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
export default function PlaceholderRoute() {
  const { section } = useLocalSearchParams<{ section: string }>();
  return <PlaceholderScreen section={section} />;
}
