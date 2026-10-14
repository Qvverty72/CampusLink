import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

// Limita cada solicitud a Data API y Auth, también para clientes asociados a un usuario.
const timedFetch: typeof fetch = (input, init) => {
  const existingSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const timeout = AbortSignal.timeout(env.databaseTimeoutMs);
  const signal = existingSignal ? AbortSignal.any([existingSignal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};
const options = {
  db: { timeout: env.databaseTimeoutMs, retry: false },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: timedFetch },
};

// Sondas de infraestructura de solo lectura. No iniciar sesión de usuarios con este cliente compartido.
// Sin clave de servidor, las sondas usan la clave pública y las políticas RLS del proyecto.
export const supabaseTechnical = createClient(
  env.supabaseUrl,
  env.supabaseSecretKey ?? env.supabasePublishableKey,
  options,
);

// Las llamadas de autenticación usan la clave pública del proyecto, nunca el secreto técnico.
export const supabaseAuth = createClient(env.supabaseUrl, env.supabasePublishableKey, options);

// El registro puede crear una sesión; se aísla de clientes compartidos y otras solicitudes.
export function createPublicSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, options);
}
// Persistencia propiedad del servidor: no recurre a permisos públicos ni inicia sesiones de usuario.
export function createServerSupabaseClient() {
  if (!env.supabaseSecretKey) throw new Error('A server Supabase key is required');
  return createClient(env.supabaseUrl, env.supabaseSecretKey, options);
}

// Quien lo invoque debe validar el JWT antes de usarlo en operaciones de negocio protegidas.
/** Crea un cliente con el Bearer del usuario; quien lo invoque debe haber validado antes el JWT. */
export function createUserSupabaseClient(accessToken: string) {
  if (!accessToken.trim()) throw new Error('An access token is required');
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    ...options,
    global: { ...options.global, headers: { Authorization: 'Bearer ' + accessToken } },
  });
}
