import { getSupabaseClient } from './supabaseClient';
import { authenticatedRequest } from '@/lib/api/authenticated-request';
import type { RegistrationInput, RegistrationOption } from '../types/registration';

// Conserva en memoria el intercambio verificado si el SDK no instala la sesión al instante.
// La persistencia de la sesión sigue siendo responsabilidad exclusiva del SDK.
let pendingSession: { access_token: string; refresh_token: string } | null = null;

/** Reintenta instalar la sesión verificada que quedó pendiente en memoria. */
async function restoreRegistrationSession(): Promise<boolean> {
  if (!pendingSession) return true;
  try {
    const client = getSupabaseClient();
    if (!client) return false;
    const { data, error } = await client.auth.setSession(pendingSession);
    if (error || !data.session) return false;
    pendingSession = null;
    return true;
  } catch { return false; }
}

/** Ejecuta endpoints públicos de registro y traduce códigos de backend a mensajes útiles. */
async function registrationRequest<T>(endpoint: 'registration-options' | 'register' | 'register/confirm' | 'register/resend', init: RequestInit = {}): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('El registro no está disponible.');
  let response: Response;
  try {
    response = await fetch(base + '/api/v1/auth/' + endpoint, {
      ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store', redirect: 'error',
    });
  } catch {
    throw new Error('No se pudo conectar. Revisa tu conexión e inténtalo nuevamente.');
  }
  if (!response.ok) {
    let code: string | undefined;
    try { code = (await response.json()).error?.code; } catch { /* La respuesta no expone un código legible. */ }
    throw new Error(response.status === 429 ? 'Espera antes de volver a solicitar el registro.'
      : code === 'INVALID_INSTITUTIONAL_CAMPUS' ? 'Usa un correo admitido y un campus activo de su institución.'
      : code === 'INVALID_VERIFICATION' ? 'Revisa el código de verificación o solicita uno nuevo.'
      : code === 'REGISTRATION_REQUIRED' || code === 'ADMISSION_UNAVAILABLE' ? 'No se pudo completar el registro. Revisa con CampusLink la admisión de tu cuenta.'
      : response.status === 400 ? 'Revisa los datos y utiliza una contraseña que cumpla la política de seguridad.'
      : 'El registro no está disponible. Inténtalo nuevamente.');
  }
  return (await response.json() as { data: T }).data;
}

/** Carga las combinaciones de dominio institucional y campus admitidas. */
export function getRegistrationOptions(signal?: AbortSignal) {
  return registrationRequest<RegistrationOption[]>('registration-options', { signal });
}

/** Inicia el registro y solicita verificación de correo al backend. */
export function registerInstitutionalAccount(input: RegistrationInput) {
  return registrationRequest<{ status: 'verification_required' }>('register', {
    method: 'POST', body: JSON.stringify(input),
  });
}

/** Verifica el correo e intenta instalar en el SDK la sesión emitida por el backend. */
export async function confirmInstitutionalEmail(email: string, token: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('El registro no está disponible.');
  const result = await registrationRequest<{ status: 'complete' | 'profile_pending'; session: { access_token: string; refresh_token: string } }>('register/confirm', {
    method: 'POST', body: JSON.stringify({ email, code: token }),
  });
  // El backend coordina OTP y perfil; el SDK administra la sesión local del dispositivo.
  pendingSession = result.session;
  return await restoreRegistrationSession() ? result.status : 'session_pending';
}

/** Solicita reenviar el código cuando la cuenta aún requiere verificación. */
export async function resendInstitutionalConfirmation(email: string) {
  await registrationRequest('register/resend', { method: 'POST', body: JSON.stringify({ email }) });
}

/** Reintenta completar el perfil asociado a una sesión de registro ya verificada. */
export async function completeInstitutionalRegistration() {
  try {
    if (!(await restoreRegistrationSession())) throw new Error('Session unavailable');
    return await authenticatedRequest<{ status: 'complete'; userId: string; campusId: string }>('/api/v1/auth/register/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
  } catch {
    throw new Error('No se pudo completar tu cuenta. Puedes reintentar; si el problema continúa, consulta con CampusLink.');
  }
}
