import { useLocalSearchParams } from 'expo-router';
import { AuthScreen } from '@/screens/AuthScreen';
export default function AuthRoute() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  return <AuthScreen key={mode} mode={mode} />;
}
