import type { RequestHandler } from 'express';
import { ApiError } from '../../services/api-response.js';
import { verifyAuthConnection } from './auth.service.js';
import type { AuthLocals } from './auth.types.js';

// Identity gate. Each business route must additionally define its authorization policy.
export const requireAuthentication: RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> =
  async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const header = request.headers.authorization;
      const match = typeof header === 'string' ? /^Bearer +([A-Za-z0-9._~+\/-]+=*)$/i.exec(header) : null;
      if (!match || request.headersDistinct.authorization?.length !== 1) {
        throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
      }
      response.locals.auth = await verifyAuthConnection(match[1]);
      next();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        response.setHeader('WWW-Authenticate', 'Bearer');
      }
      next(error);
    }
  };
