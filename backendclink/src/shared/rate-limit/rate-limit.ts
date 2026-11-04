import { createHash } from 'node:crypto';
import { ApiError } from '../errors/api-error.js';

export interface RateLimitStore {
  consume(key: string, windowSeconds: number): Promise<{ count: number; retryAfterSeconds: number }>;
}

/** Solo desarrollo/pruebas de una instancia. No descarta cuotas vigentes para admitir claves nuevas. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; expires: number }>();
  constructor(private readonly now = Date.now, private readonly maxKeys = 100000) {}
  async consume(key: string, windowSeconds: number) {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expires <= now) {
      if (this.buckets.size >= this.maxKeys) {
        for (const [id, value] of this.buckets) if (value.expires <= now) this.buckets.delete(id);
        if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) throw new Error('Rate limit capacity unavailable');
      }
      bucket = { count: 0, expires: now + windowSeconds * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count++;
    return { count: bucket.count, retryAfterSeconds: Math.max(1, Math.ceil((bucket.expires - now) / 1000)) };
  }
}

export async function consumeRateLimit(store: RateLimitStore, subject: string, category: string, max: number, windowSeconds: number) {
  // Nunca almacenar tokens, UUID o direcciones de origen en claro en el contador compartido.
  const key = 'campuslink:rate:' + category + ':' + createHash('sha256').update(subject).digest('hex');
  let result: Awaited<ReturnType<RateLimitStore['consume']>>;
  try { result = await store.consume(key, windowSeconds); }
  catch { throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Rate limiting is temporarily unavailable.'); }
  if (result.count > max) throw new ApiError(429, 'RATE_LIMITED', 'Espera antes de volver a intentarlo.', {
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
