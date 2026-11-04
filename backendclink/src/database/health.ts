import { withDeadline } from '../shared/async/deadline.js';
import type { DependencyChecks } from '../shared/health/health.types.js';

/** Ejecuta sondas en paralelo y convierte cada fallo en estado sin filtrar datos privados. */
export async function inspectDependencies(probes: {
  supabase: () => Promise<void>;
  mongodb?: () => Promise<void>;
}): Promise<DependencyChecks> {
  const results = await Promise.all(Object.entries(probes).map(async ([dependency, probe]) => {
    try { await withDeadline(probe()); return [dependency, 'ok'] as const; }
    catch (error: unknown) {
      console.error('Dependency probe failed', {
        dependency,
        errorType: error instanceof Error && /^[A-Za-z0-9_]{1,60}$/.test(error.name) ? error.name : 'DependencyError',
        code: typeof error === 'object' && error !== null && 'code' in error && (typeof error.code === 'number' || (typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,30}$/.test(error.code))) ? error.code : undefined,
      });
      return [dependency, 'error'] as const;
    }
  }));
  return Object.fromEntries(results) as unknown as DependencyChecks;
}
