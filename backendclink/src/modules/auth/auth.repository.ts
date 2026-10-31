import { createPublicSupabaseClient, createServerSupabaseClient, createUserSupabaseClient, supabaseAuth } from '../../database/supabase/client.js';
import type { AuthAssignmentRow, AuthProfile } from './auth.types.js';
import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../shared/health/health.types.js';
import type { NewAuthProfile, RegistrationCampusRow, RegistrationDomainRow, RegistrationInput } from './auth.types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PoolClient } from 'pg';
import type { AuthAssignment } from './auth.types.js';

/** Bloqueo compartido con cambios de perfil, cuenta y concesiones de roles. */
export async function lockAccountContext(client: PoolClient, userId: string) {
  const profile = (await client.query<AuthProfile>(
    `SELECT id, campus_id, institucion_id, nombre_completo, foto_path, verificado_en, estado_cuenta, deleted_at
     FROM public.perfil_usuario WHERE id=$1 FOR NO KEY UPDATE`, [userId])).rows[0] ?? null;
  const roles = (await client.query<AuthAssignment>(
    `SELECT r.id, r.nombre AS name, ur.campus_id AS "campusId" FROM public.usuario_rol ur
     JOIN public.rol r ON r.id=ur.rol_id WHERE ur.perfil_usuario_id=$1 AND ur.revocado_en IS NULL
     ORDER BY ur.id FOR SHARE OF ur,r`, [userId])).rows;
  return { profile, roles };
}

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

// Auth se verifica aparte de las tablas públicas; no consultar `auth.users` mediante Data API.
/** Verifica el access token con Supabase Auth, que es la fuente de identidad del usuario. */
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
