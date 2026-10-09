import { createModuleHealthCheck } from '../../services/module-health.js';
import { findAuthPermissions, findAuthProfile, findAuthRoles, findAuthUser, findRegistrationCampuses, findRegistrationDomains, findServerAuthProfile, insertInstitutionalProfile, resendInstitutionalOtp, signUpInstitutionalUser, verifyInstitutionalOtp, probeAuthDependencies, signInAuthUser, requestPasswordRecovery, verifyPasswordRecovery, updateRecoveredPassword, closeRecoverySession } from './auth.repository.js';
import { ApiError } from '../../services/api-response.js';
import type { AuthAssignment, AuthAssignmentRow, VerifiedAuthConnection } from './auth.types.js';
import type { AuthHealth } from './auth.types.js';
import type { AuthProfile, RegistrationInput, RegistrationOption, VerifiedIdentity } from './auth.types.js';
import type { User } from '@supabase/supabase-js';

function credentials(body: unknown, recovery = false) {
  const invalid = () => new ApiError(400, 'VALIDATION_ERROR', 'Revisa el correo, la contraseña y el código cuando corresponda.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const values = body as Record<string, unknown>;
  const keys = recovery ? ['email', 'password', 'code'] : ['email', 'password'];
  if (Object.keys(values).some(key => !keys.includes(key)) || keys.some(key => typeof values[key] !== 'string')) throw invalid();
  const email = (values.email as string).trim().toLowerCase();
  const password = values.password as string;
  const code = recovery ? (values.code as string).trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 4096
    || (recovery && !/^\d{6,10}$/.test(code))) throw invalid();
  return { email, password, code };
}

function authFailure(error: { status?: number; code?: string }, recovery = false): ApiError {
  if (error.status === 429) return new ApiError(429, 'RATE_LIMITED', 'Espera antes de volver a intentarlo.', { retryAfterSeconds: 60 });
  if (!error.status || error.status >= 500) return new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'La autenticación no está disponible. Inténtalo nuevamente.');
  return recovery
    ? new ApiError(400, 'INVALID_VERIFICATION', 'No se pudo recuperar la cuenta. Solicita un código nuevo y revisa la política de contraseña.')
    : new ApiError(401, 'UNAUTHENTICATED', 'No se pudo iniciar sesión. Revisa tus credenciales y la verificación del correo.');
}

export async function loginAccount(body: unknown) {
  const { email, password } = credentials(body);
  try {
    const { data, error } = await signInAuthUser(email, password);
    if (error) throw authFailure(error);
    if (!data.session || !data.user?.email_confirmed_at || data.user.email?.toLowerCase() !== email) {
      throw authFailure({ status: 401 });
    }
    // Session transport only. /me checks the current profile and campus assignments.
    return { session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw authFailure({ status: 503 });
  }
}

export async function recoverAccount(body: unknown) {
  const { email } = emailRequest(body);
  // Keep every provider outcome identical, including account-specific delivery/rate errors.
  // 202 acknowledges the request; it does not promise that an email was delivered.
  try { await requestPasswordRecovery(email); } catch { /* No account enumeration. */ }
  return { status: 'recovery_requested' as const };
}

export async function resetAccountPassword(body: unknown) {
  const { email, code, password } = credentials(body, true);
  let recoveryClient: Awaited<ReturnType<typeof verifyPasswordRecovery>>['client'] | undefined;
  try {
    const result = await verifyPasswordRecovery(email, code);
    recoveryClient = result.client;
    if (result.error) throw authFailure(result.error, true);
    if (!result.data.session || result.data.user?.email?.toLowerCase() !== email) {
      throw authFailure({ status: 400 }, true);
    }
    // Only the session just established by Auth's recovery OTP may change this credential.
    const updated = await updateRecoveredPassword(recoveryClient, password);
    if (updated.error) throw authFailure(updated.error, true);
    if (updated.data.user?.id !== result.data.user.id) throw authFailure({ status: 503 }, true);
    return { status: 'password_updated' as const };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw authFailure({ status: 503 }, true);
  } finally {
    // Recovery tokens are never returned or persisted. Revoke their renewal when possible.
    if (recoveryClient) await closeRecoverySession(recoveryClient).catch(() => undefined);
  }
}

// Names for the existing catalog, not new roles or database attributes.
// User-approved matrix: admin has all functions, authorized permissions stay independent.
export function accountCapabilities(context: VerifiedAuthConnection) {
  const localRoles = context.roles.filter(role => role.campusId === context.campusId);
  const admin = localRoles.some(role => role.name === 'ADMINISTRADOR');
  const authorized = localRoles.some(role => role.name === 'USUARIO_AUTORIZADO');
  const has = (name: string) => admin || (authorized && context.permissions.some(permission =>
    permission.campusId === context.campusId && permission.name === name));
  return {
    general: admin || authorized || Boolean(context.profile.verificado_en),
    officialActivities: has('PUBLICAR_EVENTO'),
    analytics: has('ACCEDER_ANALITICA'),
    reports: has('ACCEDER_REPORTERIA'),
  };
}

function providerIdentity(user: User | null): VerifiedIdentity {
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  if (!user.email || !user.email_confirmed_at) throw new ApiError(403, 'FORBIDDEN', 'Email verification is required');
  return { userId: user.id, email: user.email.trim().toLowerCase(), emailConfirmedAt: user.email_confirmed_at,
    registration: { fullName: user.user_metadata?.nombre_completo, campusId: user.user_metadata?.campus_id } };
}

export async function getRegistrationOptions(): Promise<RegistrationOption[]> {
  try {
    const domains = await findRegistrationDomains();
    if (domains.error || !domains.data) throw new Error();
    const admitted = domains.data.filter(domain => domain.activo);
    if (!admitted.length) return [];
    const campuses = await findRegistrationCampuses([...new Set(admitted.map(domain => domain.institucion_id))]);
    if (campuses.error || !campuses.data) throw new Error();
    return admitted.flatMap(domain => {
      if (!domain.institucion?.nombre) throw new Error();
      return campuses.data.filter(campus => campus.activo && campus.institucion_id === domain.institucion_id)
        .map(campus => ({ dominio: domain.dominio, institucion_id: domain.institucion_id,
          institucion_nombre: domain.institucion!.nombre, campus_id: campus.id, campus_nombre: campus.nombre }));
    }).sort((a, b) => a.institucion_nombre.localeCompare(b.institucion_nombre) || a.campus_nombre.localeCompare(b.campus_nombre));
  } catch {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El registro no está disponible.');
  }
}

function registrationInput(body: unknown): RegistrationInput {
  const invalid = () => new ApiError(400, 'INVALID_REGISTRATION', 'Revisa el correo, nombre, contraseña y campus.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const values = body as Record<string, unknown>;
  const keys = ['email', 'password', 'fullName', 'campusId'];
  if (Object.keys(values).some(key => !keys.includes(key)) || keys.some(key => typeof values[key] !== 'string')) throw invalid();
  const input = values as unknown as RegistrationInput;
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !fullName || fullName.length > 200 || /[\u0000-\u001f\u007f]/.test(fullName)
    || !input.password || input.password.length > 4096
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.campusId)) throw invalid();
  return { email, fullName, password: input.password, campusId: input.campusId.toLowerCase() };
}

export async function registerInstitutionalAccount(body: unknown) {
  const input = registrationInput(body);
  const options = await getRegistrationOptions();
  const selected = options.find(option => option.dominio === input.email.split('@')[1] && option.campus_id === input.campusId);
  if (!selected) {
    throw new ApiError(400, 'INVALID_INSTITUTIONAL_CAMPUS', 'Usa un correo institucional admitido y un campus activo de su institución.');
  }
  try {
    const { data, error } = await signUpInstitutionalUser(input);
    if (error) {
      // Supabase may obfuscate existing accounts; keep the same response for duplicates.
      if (['user_already_exists', 'email_exists'].includes(error.code ?? '')) return { status: 'verification_required' as const };
      if (error.status === 429) {
        throw new ApiError(429, 'RATE_LIMITED', 'Espera antes de volver a solicitar el registro.', {
          retryAfterSeconds: 60,
        });
      }
      if (['weak_password', 'validation_failed', 'email_address_invalid'].includes(error.code ?? '')) {
        throw new ApiError(400, 'INVALID_REGISTRATION', 'Revisa los datos y utiliza una contraseña que cumpla la política de seguridad.');
      }
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo iniciar el registro.');
    }
    // Configuration drift (Confirm Email off) must never expose an immediate session.
    if (!data.user || data.session) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'El registro requiere confirmación de correo.');
    // Confirmed duplicate accounts may be represented by a fake user with no identities.
    if (!data.user.identities?.length || data.user.email_confirmed_at) return { status: 'verification_required' as const };
    return { status: 'verification_required' as const };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo iniciar el registro.');
  }
}

function emailRequest(body: unknown, withCode = false): { email: string; code?: string } {
  const invalid = () => new ApiError(400, 'INVALID_VERIFICATION', 'Revisa el correo y el código de verificación.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const values = body as Record<string, unknown>;
  const keys = withCode ? ['email', 'code'] : ['email'];
  if (Object.keys(values).some(key => !keys.includes(key)) || typeof values.email !== 'string') throw invalid();
  const email = values.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid();
  if (withCode && (typeof values.code !== 'string' || !/^\d{6,10}$/.test(values.code.trim()))) throw invalid();
  return { email, code: typeof values.code === 'string' ? values.code.trim() : undefined };
}

export async function resendInstitutionalConfirmation(body: unknown) {
  const { email } = emailRequest(body);
  const options = await getRegistrationOptions();
  if (!options.some(option => option.dominio === email.split('@')[1])) {
    throw new ApiError(400, 'INVALID_INSTITUTIONAL_CAMPUS', 'Usa un correo institucional admitido.');
  }
  try {
    const { error } = await resendInstitutionalOtp(email);
    if (error && !['user_not_found', 'email_not_confirmed', 'email_already_confirmed'].includes(error.code ?? '')) {
      if (error.status === 429) {
        throw new ApiError(429, 'RATE_LIMITED', 'No se pudo reenviar el código. Inténtalo nuevamente.', {
          retryAfterSeconds: 60,
        });
      }
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo reenviar el código. Inténtalo nuevamente.');
    }
    return { status: 'verification_required' as const };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo reenviar el código.');
  }
}

export async function verifyAuthIdentity(accessToken: string): Promise<VerifiedIdentity> {
  try {
    if (!accessToken.trim()) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
    const { data, error } = await findAuthUser(accessToken);
    if (error) {
      if ([400, 401, 403].includes(error.status ?? 0)) throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Authentication service is unavailable');
    }
    return providerIdentity(data.user);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Authentication service is unavailable');
  }
}

function requireActiveProfile(profile: AuthProfile, userId: string) {
  if (profile.id !== userId || profile.estado_cuenta !== 'ACTIVA' || profile.deleted_at) {
    throw new ApiError(403, 'FORBIDDEN', 'An active account profile is required');
  }
}

function registrationDetails(identity: VerifiedIdentity) {
  const fullName = typeof identity.registration.fullName === 'string' ? identity.registration.fullName.trim() : '';
  const campusId = typeof identity.registration.campusId === 'string' ? identity.registration.campusId.trim().toLowerCase() : '';
  if (!fullName || fullName.length > 200 || /[\u0000-\u001f\u007f]/.test(fullName)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId)) {
    throw new ApiError(403, 'REGISTRATION_REQUIRED', 'No hay datos válidos para completar esta cuenta.');
  }
  return { fullName, campusId };
}

export async function completeInstitutionalRegistration(identity: VerifiedIdentity) {
  try {
    const existing = await findServerAuthProfile(identity.userId);
    if (existing.error) throw new Error();
    if (existing.data) {
      requireActiveProfile(existing.data, identity.userId);
      return { status: 'complete' as const, userId: identity.userId, campusId: existing.data.campus_id };
    }
    const details = registrationDetails(identity);
    const options = await getRegistrationOptions();
    const admission = options.find(option => option.dominio === identity.email.split('@')[1]
      && option.campus_id === details.campusId);
    if (!admission) {
      throw new ApiError(403, 'ADMISSION_UNAVAILABLE', 'El dominio o campus del registro ya no está disponible.');
    }
    const inserted = await insertInstitutionalProfile({ id: identity.userId, institucion_id: admission.institucion_id,
      campus_id: admission.campus_id, nombre_completo: details.fullName,
      verificado_en: identity.emailConfirmedAt, estado_cuenta: 'ACTIVA' });
    let profile = inserted.data;
    if (inserted.error?.code === '23505') {
      // Another retry may have completed concurrently. Never update the winning profile.
      const winner = await findServerAuthProfile(identity.userId);
      if (winner.error) throw new Error();
      profile = winner.data;
    } else if (inserted.error) throw new Error();
    if (!profile) throw new Error();
    requireActiveProfile(profile, identity.userId);
    return { status: 'complete' as const, userId: identity.userId, campusId: profile.campus_id };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo completar la cuenta. Puedes reintentar.');
  }
}

export async function confirmInstitutionalRegistration(body: unknown) {
  const { email, code } = emailRequest(body, true);
  try {
    const { data, error } = await verifyInstitutionalOtp(email, code!);
    if (error || !data.session) {
      if (error?.status === 429) {
        throw new ApiError(429, 'RATE_LIMITED', 'No se pudo verificar. Revisa el código o solicita uno nuevo.', {
          retryAfterSeconds: 60,
        });
      }
      if (error && [0, 500, 502, 503, 504].includes(error.status ?? 0)) {
        throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo verificar el correo.');
      }
      throw new ApiError(400, 'INVALID_VERIFICATION', 'No se pudo verificar. Revisa el código o solicita uno nuevo.');
    }
    // verifyOtp validates the code with Auth. Avoid a second Auth call after consuming it.
    const identity = providerIdentity(data.user);
    if (identity.email !== email) throw new ApiError(403, 'FORBIDDEN', 'La verificación no corresponde a esta cuenta.');
    let status: 'complete' | 'profile_pending' = 'complete';
    try { await completeInstitutionalRegistration(identity); }
    catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 503) throw reason;
      status = 'profile_pending'; // Preserve the verified session so provisioning can be retried.
    }
    return { status, session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo verificar el correo.');
  }
}

export const getAuthHealth: () => Promise<AuthHealth> =
  createModuleHealthCheck('auth', probeAuthDependencies);

function assignments(rows: AuthAssignmentRow[], kind: 'rol' | 'permiso'): AuthAssignment[] {
  return rows.map(row => {
    const value = row[kind];
    if (!value || !value.id || !value.nombre || !row.campus_id) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account context is unavailable');
    }
    return { id: value.id, name: value.nombre, campusId: row.campus_id };
  });
}

// Fresh identity and PostgreSQL context on every call. This does not grant operation permissions.
export async function verifyAuthConnection(accessToken: string): Promise<VerifiedAuthConnection> {
  try {
    const identity = await verifyAuthIdentity(accessToken);
    const profile = await findAuthProfile(accessToken, identity.userId);
    if (profile.error) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Profile service is unavailable');
    if (!profile.data) {
      throw new ApiError(403, 'FORBIDDEN', 'An active account profile is required');
    }
    requireActiveProfile(profile.data, identity.userId);
    const [roles, permissions] = await Promise.all([
      findAuthRoles(accessToken, identity.userId),
      findAuthPermissions(accessToken, identity.userId),
    ]);
    if (roles.error || permissions.error || !roles.data || !permissions.data) {
      throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Account context is unavailable');
    }
    return {
      userId: identity.userId,
      campusId: profile.data.campus_id,
      profile: profile.data,
      roles: assignments(roles.data, 'rol'),
      permissions: assignments(permissions.data, 'permiso'),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Authentication service is unavailable');
  }
}
