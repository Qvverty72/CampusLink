import { inspectDependencies } from '../../../database/health.js';
import { probeSupabaseTables } from '../../../database/supabase/health.js';
import type { DependencyChecks } from '../../../types/api.types.js';

export function probePhysicalgoodsDependencies(): Promise<DependencyChecks> {
  return inspectDependencies({
    supabase: () => probeSupabaseTables([{"table":"publicacion_recurso","resourceType":"FISICO"},{"table":"recurso_fisico","column":"publicacion_id"}]),
  });
}
