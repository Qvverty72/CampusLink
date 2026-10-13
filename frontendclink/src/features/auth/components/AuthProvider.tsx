import type { ReactNode } from 'react';
import { AuthContext } from '../hooks/useAuth';
import { useAuthSession } from '../hooks/useAuthSession';

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
