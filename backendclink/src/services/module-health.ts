import { env } from '../config/env.js';
import type { DependencyChecks, ModuleHealth, ModuleName } from '../types/api.types.js';

// Deduplicate concurrent probes and cache briefly, including failures, to bound polling load.
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
