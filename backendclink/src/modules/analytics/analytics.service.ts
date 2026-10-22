import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeAnalyticsDependencies } from './analytics.repository.js';
import type { AnalyticsHealth } from './analytics.types.js';
import { createHash } from 'node:crypto';
import { ApiError } from '../../services/api-response.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { lockAccountContext } from '../auth/auth.repository.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { findAnalyticsResource, insertResourceView } from './analytics.repository.js';

export const getAnalyticsHealth: () => Promise<AnalyticsHealth> =
  createModuleHealthCheck('analytics', probeAnalyticsDependencies);

/** Identidad de operación suministrada por el cliente; nunca identidad del actor o campus. */
export function parseResourceOperationId(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El identificador de operación debe ser un UUID v4.');
  }
  return raw.toLowerCase();
}

/** Usa las PK existentes; espacios distintos para vistas y solicitudes, sin crear estructuras SQL. */
export function resourceOperationKey(kind: 'view' | 'request', userId: string, operationId: string): string {
  const hash = createHash('sha256').update(`campuslink:${kind}:${userId}:${operationId}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

export async function recordResourceView(auth: VerifiedAuthConnection, rawId: unknown, body: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  if (typeof rawId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)
    || !body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !('operationId' in body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Envía solo el identificador de apertura del recurso.');
  }
  const operationId = parseResourceOperationId(body.operationId);
  if (!operationId) throw new ApiError(400, 'VALIDATION_ERROR', 'Falta el identificador de apertura.');
  try {
    return await withPostgresTransaction(async client => {
      const { profile, roles } = await lockAccountContext(client, auth.userId);
      if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) {
        throw new ApiError(409, 'CONFLICT', 'Tu contexto cambió. Recarga el recurso.');
      }
      requireCampusCapability({ ...auth, profile, roles }, profile.campus_id, 'general');
      const resource = await findAnalyticsResource(client, rawId, profile.campus_id, profile.institucion_id);
      if (!resource) throw new ApiError(404, 'NOT_FOUND', 'El recurso no está disponible.');
      const saved = await insertResourceView(client, resourceOperationKey('view', auth.userId, operationId), auth.userId, resource.id);
      if (!saved || saved.publicacion_id !== resource.id || saved.perfil_usuario_id !== auth.userId || saved.tipo_interaccion !== 'VISTA') {
        throw new ApiError(409, 'CONFLICT', 'El identificador de apertura ya corresponde a otro recurso.');
      }
      return { publicationId: resource.id, campusId: resource.campus_id, type: 'VISTA' as const, recorded: true };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo registrar la vista.');
  }
}
