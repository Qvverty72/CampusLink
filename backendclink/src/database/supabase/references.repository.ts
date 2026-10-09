import { createServerSupabaseClient, supabaseTechnical } from './client.js';
import type { CampusReference, UserReference } from '../../types/references.js';

export async function findCampusReference(id: string): Promise<CampusReference | null> {
  // Preserve the existing technical/public campus lookup used by the map endpoint.
  const { data, error } = await supabaseTechnical.from('campus')
    .select('id,institucion_id,activo').eq('id', id).maybeSingle<CampusReference>();
  if (error) throw error;
  return data;
}

export async function findUserReference(id: string): Promise<UserReference | null> {
  // Other users' existence is a server-side integrity check, never a public profile query.
  const { data, error } = await createServerSupabaseClient().from('perfil_usuario')
    .select('id,campus_id,institucion_id,estado_cuenta,deleted_at').eq('id', id).maybeSingle<UserReference>();
  if (error) throw error;
  return data;
}
