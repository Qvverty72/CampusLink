import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../services/api-response.js';
import { verifyAuthConnection, verifyAuthIdentity } from './auth.service.js';
import type { AuthLocals, IdentityLocals } from './auth.types.js';

function readAccessToken(request: Request): string {
  const header = request.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer +([A-Za-z0-9._~+\/-]+=*)$/i.exec(header) : null;
  if (!match || request.headersDistinct.authorization?.length !== 1) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'A valid access token is required');
  }
  return match[1];
}

// Registration completion needs verified identity before a profile exists.
export const requireVerifiedIdentity: RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, IdentityLocals> =
  async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      response.locals.identity = await verifyAuthIdentity(readAccessToken(request));
      next();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) response.setHeader('WWW-Authenticate', 'Bearer');
      next(error);
    }
  };

// Identity gate. Each business route must additionally define its authorization policy.
export const requireAuthentication: RequestHandler<Record<string, string>, unknown, unknown, Record<string, string>, AuthLocals> =
  async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      response.locals.auth = await verifyAuthConnection(readAccessToken(request));
      next();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        response.setHeader('WWW-Authenticate', 'Bearer');
      }
      next(error);
    }
  };
