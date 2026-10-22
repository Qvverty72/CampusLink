import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeAnalyticsDependencies } from './analytics.repository.js';
import type { AnalyticsHealth, DashboardData, DashboardQuery, DemandCount } from './analytics.types.js';
import { createHash } from 'node:crypto';
import { ApiError } from '../../services/api-response.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { lockAccountContext } from '../auth/auth.repository.js';
import { accountCapabilities, requireActiveAccount, requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { countActivityInteractions, findAnalyticsResource, insertResourceView, readDashboardMetrics, readDashboardOptions } from './analytics.repository.js';

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
export function parseDashboardQuery(raw: unknown, defaultCampusId: string, defaultInstitutionId: string): DashboardQuery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros del tablero.');
  const query = raw as Record<string, unknown>;
  if (Object.keys(query).some(key => !['institutionId', 'campusId', 'campusIds', 'careerId', 'from', 'to'].includes(key))
    || (query.campusId !== undefined && query.campusIds !== undefined)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros del tablero.');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const campuses = query.campusIds ?? query.campusId ?? defaultCampusId;
  const institution = query.institutionId ?? defaultInstitutionId;
  if (typeof campuses !== 'string' || !campuses.split(',').every(id => uuid.test(id))
    || (query.campusId !== undefined && campuses.includes(','))
    || typeof institution !== 'string' || !uuid.test(institution)
    || (query.careerId !== undefined && (typeof query.careerId !== 'string' || !uuid.test(query.careerId)))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa institución, campus y carrera.');
  }
  const campusIds = [...new Set(campuses.toLowerCase().split(','))].sort();
  const from = dashboardDate(query.from), to = dashboardDate(query.to);
  if (from > to) throw new ApiError(400, 'VALIDATION_ERROR', 'La fecha inicial debe ser anterior o igual a la final.');
  return { institutionId: institution.toLowerCase(), campusIds, careerId: (query.careerId as string | undefined)?.toLowerCase() ?? null, from, to };
}

export async function getDashboardOptions(auth: VerifiedAuthConnection) {
  requireActiveAccount(auth.profile, auth.userId);
  const campusIds = [...new Set(auth.roles.map(role => role.campusId))]
    .filter(id => accountCapabilities(auth, id).reports);
  if (!campusIds.length) throw new ApiError(403, 'FORBIDDEN', 'No tienes permiso de reportería.');
  try {
    const options = await withPostgresTransaction(client => readDashboardOptions(client, campusIds, auth.profile.institucion_id));
    if (!options.institutions.length) throw new ApiError(403, 'FORBIDDEN', 'No tienes campus habilitados para reportería.');
    return options;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudieron consultar los filtros. Inténtalo nuevamente.');
  }
}

export async function getDashboard(auth: VerifiedAuthConnection, rawQuery: unknown): Promise<DashboardData> {
  const query = parseDashboardQuery(rawQuery, auth.campusId, auth.profile.institucion_id);
  requireActiveAccount(auth.profile, auth.userId);
  if (query.institutionId !== auth.profile.institucion_id) throw new ApiError(403, 'FORBIDDEN', 'No tienes autorización para esta institución.');
  for (const id of query.campusIds) requireCampusCapability(auth, id, 'reports');
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const until = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000);
  try {
    const sql = await withPostgresTransaction(client => readDashboardMetrics(client, query.campusIds, query.institutionId, from, until, query.careerId));
    if (!sql) throw new ApiError(403, 'FORBIDDEN', 'La institución, campus o carrera no están disponibles en tu ámbito de reportería.');
    const activities = await countActivityInteractions(query.campusIds, from, until, sql.careerUserIds);
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
        'Carreras: se usan las asociaciones actuales del usuario o recurso. En actividades se considera la carrera del participante. Una persona o recurso puede figurar en varias carreras; sus resultados no deben sumarse como exclusivos.',
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
