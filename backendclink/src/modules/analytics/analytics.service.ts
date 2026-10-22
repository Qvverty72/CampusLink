import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeAnalyticsDependencies } from './analytics.repository.js';
import type { AnalyticsHealth, DashboardData, DashboardQuery, DemandCount } from './analytics.types.js';
import { createHash } from 'node:crypto';
import { ApiError } from '../../services/api-response.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { lockAccountContext } from '../auth/auth.repository.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { countActivityInteractions, findAnalyticsResource, insertResourceView, readDashboardMetrics } from './analytics.repository.js';

export const getAnalyticsHealth: () => Promise<AnalyticsHealth> =
  createModuleHealthCheck('analytics', probeAnalyticsDependencies);

function dashboardDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Indica fechas válidas en formato AAAA-MM-DD.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Indica fechas válidas en formato AAAA-MM-DD.');
  }
  return value;
}

/** Fechas civiles UTC inclusivas en la API, convertidas a [from,until) para ambos motores. */
export function parseDashboardQuery(raw: unknown, defaultCampusId: string): DashboardQuery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros del tablero.');
  const query = raw as Record<string, unknown>;
  if (Object.keys(query).some(key => !['campusId', 'from', 'to'].includes(key))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros del tablero.');
  }
  const campusId = query.campusId ?? defaultCampusId;
  if (typeof campusId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Campus inválido.');
  }
  const from = dashboardDate(query.from), to = dashboardDate(query.to);
  if (from > to) throw new ApiError(400, 'VALIDATION_ERROR', 'La fecha inicial debe ser anterior o igual a la final.');
  return { campusId: campusId.toLowerCase(), from, to };
}

export async function getDashboard(auth: VerifiedAuthConnection, rawQuery: unknown): Promise<DashboardData> {
  const query = parseDashboardQuery(rawQuery, auth.campusId);
  requireCampusCapability(auth, query.campusId, 'reports');
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const until = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000);
  try {
    const sql = await withPostgresTransaction(client => readDashboardMetrics(client, query.campusId, auth.profile.institucion_id, from, until));
    if (!sql) throw new ApiError(403, 'FORBIDDEN', 'No tienes autorización para este campus.');
    const activities = await countActivityInteractions(query.campusId, from, until);
    const period = { from: query.from, to: query.to, timeZone: 'UTC' as const, cutoff: until.toISOString() };
    const metric = (value: number) => ({ value, period, scope: sql.scope });
    const subjects = sql.subjectDemand.reduce<DemandCount>((total, row) =>
      ({ views: total.views + row.views, requests: total.requests + row.requests }), { views: 0, requests: 0 });
    return { period, scope: sql.scope, generatedAt: new Date().toISOString(),
      activeUsers: metric(sql.activeUsers),
      resourceDemand: { ...metric(sql.resourceDemand.views + sql.resourceDemand.requests), ...sql.resourceDemand },
      subjectDemand: { ...metric(subjects.views + subjects.requests), ...subjects, subjects: sql.subjectDemand },
      activityParticipation: { ...metric(activities.joined), label: 'Inscripciones registradas', legacyEvents: activities.legacyEvents },
      notes: [
        'Las cifras corresponden a registros disponibles; las vistas antiguas y las inscripciones importadas pueden tener cobertura parcial.',
        'Usuarios: estado reconstruido al corte con auditoría; la pertenencia a campus y las asociaciones de asignaturas son las disponibles al consultar.',
      ] };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar el tablero. Inténtalo nuevamente.');
  }
}

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
