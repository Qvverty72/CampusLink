import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** Envía al usuario a perfil si su identidad está lista o al acceso en los demás estados. */
export default function IndexRedirect() {
  const auth = useAuth();
  return <Redirect href={auth.status === 'ready' ? '/profile' : '/login'} />;
}
