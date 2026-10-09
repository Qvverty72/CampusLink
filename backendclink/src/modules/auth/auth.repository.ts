import { createPublicSupabaseClient, createServerSupabaseClient, createUserSupabaseClient, supabaseAuth } from '../../database/supabase/client.js';
import type { AuthAssignmentRow, AuthProfile } from './auth.types.js';
import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';
import type { NewAuthProfile, RegistrationCampusRow, RegistrationDomainRow, RegistrationInput } from './auth.types.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function findRegistrationDomains() {
  return createServerSupabaseClient().from('dominio_institucional')
    .select('dominio,institucion_id,activo,institucion:institucion_id(nombre)').returns<RegistrationDomainRow[]>();
}
export async function findRegistrationCampuses(institutionIds: string[]) {
  return createServerSupabaseClient().from('campus').select('id,institucion_id,nombre,activo')
    .in('institucion_id', institutionIds).returns<RegistrationCampusRow[]>();
}
export async function findServerAuthProfile(userId: string) {
  return createServerSupabaseClient().from('perfil_usuario')
    .select('id,institucion_id,campus_id,nombre_completo,foto_path,verificado_en,estado_cuenta,deleted_at')
    .eq('id', userId).maybeSingle<AuthProfile>();
}
export async function insertInstitutionalProfile(profile: NewAuthProfile) {
  return createServerSupabaseClient().from('perfil_usuario').insert(profile)
    .select('id,institucion_id,campus_id,nombre_completo,foto_path,verificado_en,estado_cuenta,deleted_at').single<AuthProfile>();
}
export async function signUpInstitutionalUser(input: RegistrationInput) {
  return createPublicSupabaseClient().auth.signUp({
    email: input.email, password: input.password,
    options: { data: { nombre_completo: input.fullName, campus_id: input.campusId } },
  });
}

export async function verifyInstitutionalOtp(email: string, token: string) {
  return createPublicSupabaseClient().auth.verifyOtp({ email, token, type: 'email' });
}
export async function resendInstitutionalOtp(email: string) {
  return createPublicSupabaseClient().auth.resend({ type: 'signup', email });
}

export async function signInAuthUser(email: string, password: string) {
  return createPublicSupabaseClient().auth.signInWithPassword({ email, password });
}

export async function requestPasswordRecovery(email: string) {
  return createPublicSupabaseClient().auth.resetPasswordForEmail(email);
}

export async function verifyPasswordRecovery(email: string, token: string) {
  const client = createPublicSupabaseClient();
  return { client, ...await client.auth.verifyOtp({ email, token, type: 'recovery' }) };
}

export function updateRecoveredPassword(client: SupabaseClient, password: string) {
  return client.auth.updateUser({ password });
}

export function closeRecoverySession(client: SupabaseClient) {
  return client.auth.signOut({ scope: 'local' });
}

export function probeAuthDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"perfil_usuario"}]),
  });
}

// Auth is checked independently from public-table probes; never query auth.users via Data API.
export async function findAuthUser(accessToken: string) {
  return supabaseAuth.auth.getUser(accessToken);
}
export async function findAuthProfile(accessToken: string, userId: string) {
  return createUserSupabaseClient(accessToken).from('perfil_usuario')
    .select('id,institucion_id,campus_id,nombre_completo,foto_path,verificado_en,estado_cuenta,deleted_at')
    .eq('id', userId).maybeSingle<AuthProfile>();
}

export async function findAuthRoles(accessToken: string, userId: string) {
  return createUserSupabaseClient(accessToken).from('usuario_rol')
    .select('campus_id,rol:rol_id(id,nombre)')
    .eq('perfil_usuario_id', userId).is('revocado_en', null).returns<AuthAssignmentRow[]>();
}

export async function findAuthPermissions(accessToken: string, userId: string) {
  return createUserSupabaseClient(accessToken).from('usuario_permiso')
    .select('campus_id,permiso:permiso_id(id,nombre)')
    .eq('perfil_usuario_id', userId).is('revocado_en', null).returns<AuthAssignmentRow[]>();
}
