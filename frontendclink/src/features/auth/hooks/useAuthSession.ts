import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { AuthApiError } from '@/lib/api/authenticated-request';
import { loadAuthIdentity } from '../api/authApi';
import { getSupabaseClient } from '../api/supabaseClient';
import type { AuthContextValue, AuthIdentity, AuthStatus } from '../types/auth';

/** Sincroniza sesión del SDK con identidad y capacidades confirmadas por el backend. */
export function useAuthSession(): AuthContextValue {
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [denialCode, setDenialCode] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [revision, setRevision] = useState(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const verifiedIdentity = useRef<AuthIdentity | null>(null);
  const deniedAccount = useRef<string | null>(null);
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
    deniedAccount.current = null;
    pendingRequest.current?.abort();
    // Revalidar la misma cuenta no debe retirar rutas ni descartar sus formularios.
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
    // Supabase emite INITIAL_SESSION al restaurar persistencia; el callback se mantiene síncrono.
    const { data: { subscription } } = auth.onAuthStateChange((_event, nextSession) => {
      // Un token nuevo no cambia el estado de una cuenta rechazada por el servidor.
      if (nextSession && deniedAccount.current === nextSession.user.id) {
        setSession(nextSession);
        return;
      }
      deniedAccount.current = null;
      setDenialCode(null);
      pendingRequest.current?.abort();
      const sameAccount = nextSession && verifiedIdentity.current?.userId === nextSession.user.id;
      if (!sameAccount) {
        verifiedIdentity.current = null;
        setIdentity(null);
        setStatus(nextSession ? 'loading' : 'signedOut');
      }
      setError(null);
      setSession(nextSession);
      setRestored(true);
      setRevision(value => value + 1);
    });
    const stateSubscription = AppState.addEventListener('change', state => {
      if (Platform.OS !== 'web') {
        if (state === 'active') auth.startAutoRefresh(); else auth.stopAutoRefresh();
      }
      if (state === 'active' && !deniedAccount.current) refreshIdentity();
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
    if (!session) { verifiedIdentity.current = null; setIdentity(null); setStatus('signedOut'); return; }
    if (deniedAccount.current === session.user.id) return;
    const abort = new AbortController();
    pendingRequest.current = abort;
    const previousIdentity = verifiedIdentity.current;
    const revalidating = previousIdentity?.userId === session.user.id;
    if (!revalidating) {
      verifiedIdentity.current = null;
      setIdentity(null);
      setStatus('loading');
    }
    setError(null);
    void loadAuthIdentity(abort.signal)
      .then(value => {
        if (abort.signal.aborted) return;
        if (value.userId !== session.user.id || value.profile.id !== session.user.id) {
          throw new AuthApiError(403);
        }
        verifiedIdentity.current = value;
        setDenialCode(null);
        setIdentity(value);
        setStatus('ready');
      }).catch(reason => {
        if (abort.signal.aborted) return;
        const denied = reason instanceof AuthApiError && [401, 403].includes(reason.status);
        // Una caída temporal no invalida la cuenta ya comprobada. El servidor sigue
        // autorizando cada operación y la próxima activación vuelve a consultar /me.
        if (revalidating && !denied) {
          setError(reason instanceof AuthApiError ? reason.message : 'No se pudo consultar la cuenta.');
          return;
        }
        verifiedIdentity.current = null;
        if (reason instanceof AuthApiError && reason.status === 403) {
          deniedAccount.current = session.user.id;
          setDenialCode(reason.code ?? 'FORBIDDEN');
        }
        setIdentity(null);
        setStatus(reason instanceof AuthApiError && reason.status === 403 ? 'forbidden'
          : reason instanceof AuthApiError && reason.status === 401 ? 'signedOut' : 'error');
        // El rechazo esperado se presenta por denialCode; error queda para fallos operativos.
        setError(reason instanceof AuthApiError && reason.status === 403 ? null
          : reason instanceof AuthApiError ? reason.message : 'No se pudo consultar la cuenta.');
      });
    return () => abort.abort();
  }, [session, restored, revision]);

  return { session, identity, status, error, denialCode, refreshIdentity, signOut };
}
