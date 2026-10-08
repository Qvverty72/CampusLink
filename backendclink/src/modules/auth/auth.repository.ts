import { createUserSupabaseClient, supabaseAuth } from '../../database/supabase/client.js';
import type { AuthProfile } from './auth.types.js';
import { inspectDependencies } from '../../database/health.js';
import { probeSupabaseTables } from '../../database/supabase/health.js';
import type { DependencyChecks } from '../../types/api.types.js';

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
    .select('id,campus_id,estado_cuenta,deleted_at').eq('id', userId).maybeSingle<AuthProfile>();
}
