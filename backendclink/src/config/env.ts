import { isIP } from 'node:net';

type Environment = Record<string, string | undefined>;

function required(input: Environment, name: string): string {
  const value = input[name]?.trim();
  if (!value) throw new Error(name + ' is required');
  return value;
}

function integer(input: Environment, name: string, fallback: number, min: number, max: number): number {
  const value = Number(input[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(name + ' must be an integer between ' + min + ' and ' + max);
  }
  return value;
}

/**
 * Valida y normaliza la configuración sin leer el proceso global.
 * Los errores identifican el ajuste, pero nunca revelan su valor ni credenciales.
 */
export function loadEnv(input: Environment) {
  const mongodbUri = required(input, 'MONGODB_URI');
  if (!/^mongodb(?:\+srv)?:\/\//.test(mongodbUri)) {
    throw new Error('MONGODB_URI must use mongodb:// or mongodb+srv://');
  }
  const supabaseUrl = required(input, 'SUPABASE_URL');
  let url: URL;
  try { url = new URL(supabaseUrl); } catch { throw new Error('SUPABASE_URL must be an HTTP(S) URL'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('SUPABASE_URL must be an HTTP(S) origin without credentials');
  }
  const mongodbDnsServers = input.MONGODB_DNS_SERVERS?.trim()
    ? input.MONGODB_DNS_SERVERS.split(',').map(server => server.trim()) : [];
  if (mongodbDnsServers.some(server => !isIP(server))) {
    throw new Error('MONGODB_DNS_SERVERS must contain comma-separated DNS server IP addresses');
  }
  const nodeEnv = input.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const diagnostics = input.HEALTH_DIAGNOSTICS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(diagnostics)) {
    throw new Error('HEALTH_DIAGNOSTICS_ENABLED must be true or false');
  }
  const supabaseDatabaseUrl = input.SUPABASE_DB_URL?.trim() || undefined;
  const rateLimitRedisUrl = input.RATE_LIMIT_REDIS_URL?.trim() || undefined;
  if (rateLimitRedisUrl) {
    try {
      const redisUrl = new URL(rateLimitRedisUrl);
      if (!['redis:', 'rediss:'].includes(redisUrl.protocol) || !redisUrl.hostname) throw new Error();
    } catch { throw new Error('RATE_LIMIT_REDIS_URL must be a Redis connection URL'); }
  }
  if (nodeEnv === 'production' && !rateLimitRedisUrl) {
    throw new Error('RATE_LIMIT_REDIS_URL is required in production for shared rate limits');
  }
  if (supabaseDatabaseUrl) {
    let databaseUrl: URL;
    try { databaseUrl = new URL(supabaseDatabaseUrl); } catch { throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection URL'); }
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !databaseUrl.hostname || !databaseUrl.username || databaseUrl.hash) {
      throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection URL');
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname);
    if (!local && ((databaseUrl.searchParams.has('ssl') && databaseUrl.searchParams.get('ssl') !== 'true')
      || (databaseUrl.searchParams.has('sslmode') && databaseUrl.searchParams.get('sslmode') !== 'verify-full'))) {
      throw new Error('SUPABASE_DB_URL must use verified TLS for remote connections');
    }
  }
  return {
    mongodbUri,
    mongodbDnsServers,
    mongodbDbName: input.MONGODB_DB_NAME?.trim() || 'campuslink',
    supabaseUrl: url.origin,
    supabasePublishableKey: required(input, 'SUPABASE_PUBLISHABLE_KEY'),
    supabaseSecretKey: input.SUPABASE_SECRET_KEY?.trim() || input.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    supabaseDatabaseUrl,
    nodeEnv,
    port: integer(input, 'PORT', 3000, 1, 65535),
    databaseTimeoutMs: integer(input, 'DATABASE_TIMEOUT_MS', 5000, 100, 60000),
    healthCacheTtlMs: integer(input, 'HEALTH_CACHE_TTL_MS', 5000, 0, 60000),
    healthDiagnosticsEnabled: nodeEnv === 'development' && diagnostics === 'true',
    rateLimitRedisUrl,
    rateLimitWindowSeconds: integer(input, 'RATE_LIMIT_WINDOW_SECONDS', 60, 1, 3600),
    rateLimitAuthMax: integer(input, 'RATE_LIMIT_AUTH_MAX', 15, 1, 100000),
    rateLimitReadMax: integer(input, 'RATE_LIMIT_READ_MAX', 300, 1, 100000),
    rateLimitWriteMax: integer(input, 'RATE_LIMIT_WRITE_MAX', 60, 1, 100000),
    rateLimitOriginMax: integer(input, 'RATE_LIMIT_ORIGIN_MAX', 1200, 1, 1000000),
  };
}

export const env = loadEnv(process.env);
