import { env } from '../config/env.js';
import type { DependencyChecks, ModuleHealth, ModuleName } from '../types/api.types.js';

// Agrupa sondas concurrentes y conserva brevemente también los fallos para limitar la carga de sondeo.
/** Crea una sonda por módulo con caché breve y una sola ejecución simultánea. */
export function createModuleHealthCheck<M extends ModuleName>(
  module: M, probe: () => Promise<DependencyChecks>, ttlMs = env.healthCacheTtlMs,
): () => Promise<ModuleHealth<M>> {
  let cached: ModuleHealth<M> | undefined;
  let expiresAt = 0;
  let pending: Promise<ModuleHealth<M>> | undefined;
  return () => {
    if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
    if (pending) return pending;
    pending = probe().then(dependencies => {
      cached = { module, status: Object.values(dependencies).every(value => value === 'ok') ? 'ok' : 'unavailable', dependencies };
      expiresAt = Date.now() + ttlMs;
      return cached;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
