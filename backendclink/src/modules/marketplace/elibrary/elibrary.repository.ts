import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import type { DependencyChecks } from '../../../types/api.types.js';

export function probeElibraryDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"publicacion_recurso","resourceType":"DIGITAL"},{"table":"recurso_digital","column":"publicacion_id"}]),
  });
}
