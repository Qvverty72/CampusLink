import { Router, type RequestHandler } from 'express';
import { METHODS } from 'node:http';
import { requireAuthentication, requireVerifiedIdentity } from '../../modules/auth/auth.middleware.js';
import { ApiError } from '../errors/api-error.js';

/** Declaración explícita para autenticación pública, liveness y diagnósticos development opt-in. */
export const publicEndpoint: RequestHandler = (_request, _response, next) => next();

const denyUndefinedPolicy: RequestHandler = (_request, _response, next) => {
  next(new ApiError(403, 'FORBIDDEN', 'This endpoint has no access policy.'));
};

/**
 * Router Express normal con una comprobación al registrar cada endpoint.
 * La declaración de sesión no reemplaza los permisos/campus/propiedad del servicio.
 * Si falta la declaración, autentica (401) y luego deniega (403), sin ejecutar el controlador.
 */
export function createPolicyRouter(): Router {
  const router = Router();
  const route = router.route.bind(router);
  router.route = ((path: string) => {
    const endpoint = route(path);
    const methods = endpoint as unknown as Record<string, (...handlers: unknown[]) => unknown>;
    for (const method of [...METHODS.map(method => method.toLowerCase()), 'all']) {
      if (typeof methods[method] !== 'function') continue;
      const register = methods[method].bind(endpoint);
      methods[method] = (...handlers: unknown[]) => {
        // La política debe preceder a validadores/controladores; declararla después no protege la ruta.
        const policy = handlers.flat(Infinity)[0];
        const declared = policy === publicEndpoint || policy === requireAuthentication || policy === requireVerifiedIdentity;
        return register(...(declared ? handlers : [requireAuthentication, denyUndefinedPolicy, ...handlers]));
      };
    }
    return endpoint;
  }) as typeof router.route;
  return router;
}
