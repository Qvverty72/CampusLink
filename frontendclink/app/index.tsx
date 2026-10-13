import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';

export default function IndexRedirect() {
  const auth = useAuth();
  return <Redirect href={auth.status === 'ready' ? '/profile' : '/login'} />;
}
