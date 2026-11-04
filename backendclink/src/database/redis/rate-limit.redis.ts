import { createClient } from 'redis';
import { env } from '../../config/env.js';
import type { RateLimitStore } from '../../shared/rate-limit/rate-limit.js';
import { withDeadline } from '../../shared/async/deadline.js';

// Un solo comando atómico: el reloj/TTL de Redis es común a todas las instancias.
export const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

let client: ReturnType<typeof createClient> | undefined;
let connecting: Promise<unknown> | undefined;
export async function connectRateLimitRedis() {
  if (!env.rateLimitRedisUrl) return;
  if (!client) {
    client = createClient({ url: env.rateLimitRedisUrl, disableOfflineQueue: true,
      socket: { connectTimeout: env.databaseTimeoutMs, reconnectStrategy: false } });
    // No registrar el error del proveedor: puede contener credenciales/origen.
    client.on('error', () => undefined);
  }
  if (!client.isReady) {
    connecting ??= client.connect().finally(() => { connecting = undefined; });
    await connecting;
  }
}

export const redisRateLimitStore: RateLimitStore = {
  async consume(key, windowSeconds) {
    await connectRateLimitRedis();
    if (!client?.isReady) throw new Error('Shared rate limit unavailable');
    const result = await withDeadline(client.eval(consumeScript, { keys: [key], arguments: [String(windowSeconds * 1000)] }));
    if (!Array.isArray(result) || result.length !== 2 || typeof result[0] !== 'number' || typeof result[1] !== 'number'
      || result[0] < 1 || result[1] < 0) throw new Error('Invalid rate counter');
    return { count: result[0], retryAfterSeconds: Math.max(1, Math.ceil(result[1] / 1000)) };
  },
};

export async function closeRateLimitRedis() {
  if (client?.isOpen) client.destroy();
  client = undefined;
  connecting = undefined;
}
