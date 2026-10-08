import { supabaseTechnical } from './client.js';

export type SupabaseProbeTable = 'campus' | 'perfil_usuario' | 'publicacion_recurso' |
  'recurso_digital' | 'recurso_fisico' | 'reporte_contenido' | 'interaccion_recurso' | 'reporte';
export interface TableProbe {
  table: SupabaseProbeTable;
  column?: 'id' | 'publicacion_id';
  resourceType?: 'DIGITAL' | 'FISICO';
}

// Discard all returned rows. An empty result is a successful read, including under RLS.
export async function probeSupabaseTables(tables: readonly TableProbe[]): Promise<void> {
  await Promise.all(tables.map(async ({ table, column = 'id', resourceType }) => {
    let query = supabaseTechnical.from(table).select(column).limit(1);
    if (resourceType) query = query.eq('tipo_recurso', resourceType);
    const { error, status } = await query;
    if (error) {
      console.error('Supabase read probe failed', { table, status, code: /^[A-Z0-9_]{1,30}$/.test(error.code) ? error.code : 'TRANSPORT_ERROR' });
      throw new Error('Supabase read probe failed');
    }
  }));
}
