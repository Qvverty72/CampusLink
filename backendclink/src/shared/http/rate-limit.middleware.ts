import type { Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { consumeRateLimit, MemoryRateLimitStore, type RateLimitStore } from '../rate-limit/rate-limit.js';
import { redisRateLimitStore } from '../../database/redis/rate-limit.redis.js';

export function rateCategory(request: Pick<Request, 'method' | 'originalUrl'>): 'auth' | 'read' | 'write' {
  if (/^\/api\/v1\/auth\/(?:login|recover|register)(?:\/|\?|$)/i.test(request.originalUrl)) return 'auth';
  return ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 'read' : 'write';
}

export function createRateLimits(store: RateLimitStore = env.rateLimitRedisUrl ? redisRateLimitStore : new MemoryRateLimitStore()) {
  const origin: RequestHandler = async (request, _response, next) => {
    try {
      const category = rateCategory(request);
      await consumeRateLimit(store, 'ip:' + (request.ip ?? request.socket.remoteAddress ?? 'unknown'),
        'origin', env.rateLimitOriginMax, env.rateLimitWindowSeconds);
      if (category === 'auth') await consumeRateLimit(store,
        'ip:' + (request.ip ?? request.socket.remoteAddress ?? 'unknown'), 'auth', env.rateLimitAuthMax, env.rateLimitWindowSeconds);
      next();
    } catch (error) { next(error); }
  };
  const identity = async (request: Request, response: Response, userId: string) => {
    // Un middleware repetido en rutas anidadas no debe consumir dos veces la misma solicitud.
    if (response.locals.rateLimitIdentity === userId) return;
    const category = rateCategory(request);
    const max = category === 'auth' ? env.rateLimitAuthMax : category === 'read' ? env.rateLimitReadMax : env.rateLimitWriteMax;
    await consumeRateLimit(store, 'user:' + userId, category, max, env.rateLimitWindowSeconds);
    response.locals.rateLimitIdentity = userId;
  };
  return { origin, identity };
}
