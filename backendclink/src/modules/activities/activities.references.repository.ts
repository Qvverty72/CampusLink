import { createServerSupabaseClient } from '../../database/supabase/client.js';
import { ApiError } from '../../shared/errors/api-error.js';

/** UUID relacional vigente; nunca sustituye el ObjectId del documento ni duplica el perfil. */
export async function findValidActivityCreators(campusId: string, userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    // Evita URLs ilimitadas y una consulta por actividad.
    for (let offset = 0; offset < userIds.length; offset += 100) {
      const { data, error } = await createServerSupabaseClient().from('perfil_usuario')
        .select('id,nombre_completo').eq('campus_id', campusId).eq('estado_cuenta', 'ACTIVA')
        .is('deleted_at', null).in('id', userIds.slice(offset, offset + 100));
      if (error) throw error;
      for (const row of data ?? []) if (userIds.includes(row.id)) result.set(row.id, row.nombre_completo?.trim() || '');
    }
    return result;
  } catch { throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Activity references are temporarily unavailable.'); }
}
