import { createContext, useContext } from 'react';
import type { AuthContextValue } from '../types/auth';

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Consume el estado global de sesión y falla explícitamente si falta su proveedor. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
