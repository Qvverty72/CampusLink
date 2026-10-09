import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';

// Bounds every Data API and Auth request, including user-scoped clients.
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

// Read-only infrastructure probes. Never sign a user into this shared client.
// When no server key is configured, probes use anon + the project's RLS policies.
export const supabaseTechnical = createClient(
  env.supabaseUrl,
  env.supabaseSecretKey ?? env.supabasePublishableKey,
  options,
);

// Authentication calls use the public project key, never the technical secret.
export const supabaseAuth = createClient(env.supabaseUrl, env.supabasePublishableKey, options);

// Signup may set a session. Isolate it from shared clients and other requests.
export function createPublicSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, options);
}
// Server-owned persistence: no fallback to public privileges, and never sign in users here.
export function createServerSupabaseClient() {
  if (!env.supabaseSecretKey) throw new Error('A server Supabase key is required');
  return createClient(env.supabaseUrl, env.supabaseSecretKey, options);
}

// Callers must validate the JWT before using this client for protected business operations.
export function createUserSupabaseClient(accessToken: string) {
  if (!accessToken.trim()) throw new Error('An access token is required');
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    ...options,
    global: { ...options.global, headers: { Authorization: 'Bearer ' + accessToken } },
  });
}
