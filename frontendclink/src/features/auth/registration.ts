import { getSupabaseClient } from './supabase';
import { authenticatedRequest } from '@/lib/api/authenticated-request';

// Keep the verified exchange in memory if the SDK cannot install the session immediately.
// Persistence remains exclusively the SDK's responsibility.
let pendingSession: { access_token: string; refresh_token: string } | null = null;

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

export interface RegistrationOption {
  dominio: string;
  institucion_id: string;
  institucion_nombre: string;
  campus_id: string;
  campus_nombre: string;
}
export interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  campusId: string;
}

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
    try { code = (await response.json()).error?.code; } catch { /* No provider details. */ }
    throw new Error(response.status === 429 ? 'Espera antes de volver a solicitar el registro.'
      : code === 'INVALID_INSTITUTIONAL_CAMPUS' ? 'Usa un correo admitido y un campus activo de su institución.'
      : code === 'INVALID_VERIFICATION' ? 'Revisa el código de verificación o solicita uno nuevo.'
      : code === 'REGISTRATION_REQUIRED' || code === 'ADMISSION_UNAVAILABLE' ? 'No se pudo completar el registro. Revisa con CampusLink la admisión de tu cuenta.'
      : response.status === 400 ? 'Revisa los datos y utiliza una contraseña que cumpla la política de seguridad.'
      : 'El registro no está disponible. Inténtalo nuevamente.');
  }
  return (await response.json() as { data: T }).data;
}

export function getRegistrationOptions(signal?: AbortSignal) {
  return registrationRequest<RegistrationOption[]>('registration-options', { signal });
}

export function registerInstitutionalAccount(input: RegistrationInput) {
  return registrationRequest<{ status: 'verification_required' }>('register', {
    method: 'POST', body: JSON.stringify(input),
  });
}

export async function confirmInstitutionalEmail(email: string, token: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error('El registro no está disponible.');
  const result = await registrationRequest<{ status: 'complete' | 'profile_pending'; session: { access_token: string; refresh_token: string } }>('register/confirm', {
    method: 'POST', body: JSON.stringify({ email, code: token }),
  });
  // Express coordinates OTP and profile; the SDK manages only the device session.
  pendingSession = result.session;
  return await restoreRegistrationSession() ? result.status : 'session_pending';
}

export async function resendInstitutionalConfirmation(email: string) {
  await registrationRequest('register/resend', { method: 'POST', body: JSON.stringify({ email }) });
}

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
