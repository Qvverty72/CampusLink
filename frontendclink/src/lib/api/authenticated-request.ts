import { getSupabaseClient } from '@/features/auth/supabase';

export class AuthApiError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? 'La sesión no es válida.' : status === 403
      ? 'La cuenta no tiene acceso.' : 'No se pudo consultar la cuenta.');
  }
}

export async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await authenticatedEnvelopeRequest<T>(path, init)).data;
}

export async function authenticatedEnvelopeRequest<T, Meta = never>(path: string, init: RequestInit = {}, query?: URLSearchParams): Promise<{ data: T; meta: Meta }> {
  // Only relative API paths may receive the bearer token.
  if (!path.startsWith('/api/v1/') || /[\\?#]/.test(path) || path.includes('..')) {
    throw new Error('A relative versioned API path is required');
  }
  const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('EXPO_PUBLIC_API_URL is required');
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase Auth is not configured');
  // The SDK restores/refreshes the session; only the backend authorizes this token.
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new AuthApiError(401);
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + data.session.access_token);
  const search = query?.toString();
  const response = await fetch(baseUrl + path + (search ? '?' + search : ''), { ...init, headers, cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new AuthApiError(response.status);
  return await response.json() as { data: T; meta: Meta };
}
