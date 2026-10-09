import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { AuthApiError, authenticatedRequest } from '@/lib/api/authenticated-request';
import { getSupabaseClient } from './supabase';
import type { AuthIdentity } from './auth.types';

type AuthStatus = 'loading' | 'signedOut' | 'ready' | 'forbidden' | 'error' | 'unconfigured';
interface AuthContextValue {
  session: Session | null;
  identity: AuthIdentity | null;
  status: AuthStatus;
  error: string | null;
  refreshIdentity: () => void;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [revision, setRevision] = useState(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const signOut = useCallback(async () => {
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error();
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) {
        const { data } = await client.auth.getSession();
        setError(data.session ? 'No se pudo cerrar la sesión. Revisa tu conexión e inténtalo nuevamente.'
          : 'La sesión se retiró del dispositivo, pero no se pudo confirmar el cierre remoto. Revisa tu conexión.');
      }
    } catch {
      setError('No se pudo cerrar la sesión. Revisa tu conexión e inténtalo nuevamente.');
    }
  }, []);
  const refreshIdentity = useCallback(() => {
    pendingRequest.current?.abort();
    setIdentity(null);
    setStatus('loading');
    setRevision(value => value + 1);
  }, []);

  useEffect(() => {
    let client;
    try { client = getSupabaseClient(); } catch {
      setError('La configuración de autenticación no es válida.');
      setStatus('error');
      return;
    }
    if (!client) { setStatus('unconfigured'); return; }
    const auth = client.auth;
    // Supabase emits INITIAL_SESSION after restoring persistence. Keep callbacks synchronous.
    const { data: { subscription } } = auth.onAuthStateChange((_event, nextSession) => {
      pendingRequest.current?.abort();
      setIdentity(null);
      setError(null);
      setStatus(nextSession ? 'loading' : 'signedOut');
      setSession(nextSession);
      setRestored(true);
      setRevision(value => value + 1);
    });
    const stateSubscription = AppState.addEventListener('change', state => {
      if (Platform.OS !== 'web') {
        if (state === 'active') auth.startAutoRefresh(); else auth.stopAutoRefresh();
      }
      if (state === 'active') refreshIdentity();
    });
    if (Platform.OS !== 'web') {
      if (AppState.currentState === 'active') auth.startAutoRefresh(); else auth.stopAutoRefresh();
    }
    return () => {
      pendingRequest.current?.abort();
      subscription.unsubscribe();
      stateSubscription.remove();
      if (Platform.OS !== 'web') auth.stopAutoRefresh();
    };
  }, [refreshIdentity]);

  useEffect(() => {
    if (!restored) return;
    if (!session) { setIdentity(null); setStatus('signedOut'); return; }
    const abort = new AbortController();
    pendingRequest.current = abort;
    setIdentity(null);
    setError(null);
    setStatus('loading');
    void authenticatedRequest<AuthIdentity>('/api/v1/auth/me', { signal: abort.signal })
      .then(value => {
        if (abort.signal.aborted) return;
        if (value.userId !== session.user.id || value.profile.id !== session.user.id) {
          throw new AuthApiError(403);
        }
        setIdentity(value);
        setStatus('ready');
      }).catch(reason => {
        if (abort.signal.aborted) return;
        setIdentity(null);
        setStatus(reason instanceof AuthApiError && reason.status === 403 ? 'forbidden'
          : reason instanceof AuthApiError && reason.status === 401 ? 'signedOut' : 'error');
        setError(reason instanceof AuthApiError ? reason.message : 'No se pudo consultar la cuenta.');
      });
    return () => abort.abort();
  }, [session, restored, revision]);

  return <AuthContext.Provider value={{ session, identity, status, error, refreshIdentity, signOut }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
