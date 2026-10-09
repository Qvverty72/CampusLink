import { getSupabaseClient } from './supabase';

async function sessionRequest<T>(endpoint: 'login' | 'recover' | 'recover/confirm', body: object): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('La autenticación no está disponible.');
  let response: Response;
  try {
    response = await fetch(base + '/api/v1/auth/' + endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      cache: 'no-store', redirect: 'error',
    });
  } catch { throw new Error('No se pudo conectar. Revisa tu conexión e inténtalo nuevamente.'); }
  if (!response.ok) {
    throw new Error(response.status === 429 ? 'Espera antes de volver a intentarlo.'
      : response.status >= 500 ? endpoint === 'recover/confirm'
        ? 'No se pudo confirmar el cambio. Intenta iniciar sesión; si no funciona, solicita un código nuevo.'
        : 'La autenticación no está disponible. Inténtalo nuevamente.'
      : endpoint === 'login' ? 'No se pudo iniciar sesión. Revisa tus credenciales y la verificación del correo.'
      : 'No se pudo recuperar la cuenta. Solicita un código nuevo y revisa la política de contraseña.');
  }
  return (await response.json() as { data: T }).data;
}

export async function loginAccount(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('La autenticación no está disponible.');
  const result = await sessionRequest<{ session: { access_token: string; refresh_token: string } }>('login', { email, password });
  const { data, error } = await client.auth.setSession(result.session);
  if (error || !data.session) throw new Error('No se pudo guardar la sesión. Intenta iniciar sesión nuevamente.');
}

export async function requestRecovery(email: string) {
  await sessionRequest('recover', { email });
}

export async function resetPassword(email: string, code: string, password: string) {
  await sessionRequest('recover/confirm', { email, code, password });
}
