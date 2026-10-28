import { createModuleHealthCheck } from '../../services/module-health.js';
import { probeAnalyticsDependencies } from './analytics.repository.js';
import type { AnalyticalReport, AnalyticsHealth, DashboardData, DashboardMetrics, DashboardPeriod, DashboardQuery, DemandCount, HistoricalReportsQuery } from './analytics.types.js';
import { ANALYTICS_TIME_ZONE, dashboardIntervals } from './analytics.periods.js';
import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '../../services/api-response.js';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { lockAccountContext } from '../auth/auth.repository.js';
import { accountCapabilities, requireActiveAccount, requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { countActivityInteractions, findAnalyticalReport, findAnalyticsResource, insertAnalyticalReport, insertResourceView, readAnalyticsPermissions, readDashboardMetrics, readDashboardOptions, readHistoricalReports, readReportAuthorEmail } from './analytics.repository.js';

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

/** Fechas civiles inclusivas; la política institucional las convierte a límites comunes. */
export function parseDashboardQuery(raw: unknown, defaultCampusId: string, defaultInstitutionId: string): DashboardQuery {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros del tablero.');
  const query = raw as Record<string, unknown>;
  if (Object.keys(query).some(key => !['institutionId', 'campusId', 'campusIds', 'careerId', 'from', 'to', 'grouping'].includes(key))
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
  const grouping = query.grouping ?? 'month';
  if (grouping !== 'week' && grouping !== 'month') throw new ApiError(400, 'VALIDATION_ERROR', 'Selecciona agrupación semanal o mensual.');
  return { institutionId: institution.toLowerCase(), campusIds, careerId: (query.careerId as string | undefined)?.toLowerCase() ?? null, from, to, grouping };
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
  const intervals = dashboardIntervals(query.from, query.to, query.grouping);
  const from = intervals[0].from;
  const generatedAt = new Date();
  const until = new Date(Math.min(intervals[intervals.length - 1].until.getTime(), generatedAt.getTime()));
  const windows = intervals.filter(row => row.from < until).map(row => ({ ...row, until: new Date(Math.min(row.until.getTime(), until.getTime())) }));
  try {
    const sql = await withPostgresTransaction(client => readDashboardMetrics(client, query.campusIds, query.institutionId, from, until, query.careerId, windows, query.grouping));
    if (!sql) throw new ApiError(403, 'FORBIDDEN', 'La institución, campus o carrera no están disponibles en tu ámbito de reportería.');
    // Un rango futuro no afirma ceros observados ni proyecta el estado actual de cuentas.
    const activities = from < until ? await countActivityInteractions(query.campusIds, from, until, sql.careerUserIds, windows, query.grouping)
      : { joined: 0, legacyEvents: 0, intervals: [] };
    const period = { from: query.from, to: query.to, timeZone: ANALYTICS_TIME_ZONE, cutoff: until.toISOString() };
    const metrics = (row: typeof sql.intervals[number], participation: { joined: number; legacyEvents: number }, period: DashboardPeriod, available = true): DashboardMetrics => {
      const metric = (value: number) => ({ value: available ? value : null, period, scope: sql.scope });
      const subjects = row.subjectDemand.reduce<DemandCount>((total, item) =>
        ({ views: total.views + item.views, requests: total.requests + item.requests }), { views: 0, requests: 0 });
      return { period, scope: sql.scope, activeUsers: metric(row.activeUsers),
        resourceDemand: { ...metric(row.resourceDemand.views + row.resourceDemand.requests), ...row.resourceDemand },
        subjectDemand: { ...metric(subjects.views + subjects.requests), ...subjects, subjects: row.subjectDemand },
        activityParticipation: { ...metric(participation.joined), label: 'Inscripciones registradas', legacyEvents: participation.legacyEvents } };
    };
    return { ...metrics(sql, activities, period, from < until), generatedAt: generatedAt.toISOString(), grouping: query.grouping,
      intervals: intervals.map(interval => {
        if (interval.from >= until) return { key: interval.key, label: interval.label, period: interval.period,
          status: 'unavailable', coverage: 'unavailable', metrics: null };
        const row = sql.intervals.find(row => row.key === interval.key);
        const activity = activities.intervals.find(row => row.key === interval.key);
        if (!row || !activity) throw new Error('Missing dashboard interval.');
        const result = metrics(row, activity, { ...interval.period, cutoff: new Date(Math.min(interval.until.getTime(), until.getTime())).toISOString() });
        return { key: interval.key, label: interval.label, period: result.period,
          status: row.resourceDemand.views + row.resourceDemand.requests + activity.joined === 0 ? 'no_activity' : 'recorded',
          coverage: 'partial', metrics: result };
      }),
      notes: [
        'Las cifras corresponden a registros disponibles; las vistas antiguas y las inscripciones importadas pueden tener cobertura parcial.',
        'Referencia institucional America/Santiago: semanas de lunes a domingo y meses calendario, respetando el horario de verano. Los extremos se recortan al rango; el período en curso se consulta hasta la fecha de generación. Los intervalos futuros no tienen datos.',
        'Sin actividad significa cero vistas, solicitudes e inscripciones registradas; no demuestra cobertura histórica completa. Los usuarios activos son un saldo al corte de cada intervalo y no deben sumarse.',
        'Usuarios: estado reconstruido al corte con auditoría; la pertenencia a campus y las asociaciones de asignaturas son las disponibles al consultar.',
        'Carreras: se usan las asociaciones actuales del usuario o recurso. En actividades se considera la carrera del participante. Una persona o recurso puede figurar en varias carreras; sus resultados no deben sumarse como exclusivos.',
      ] };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar el tablero. Inténtalo nuevamente.');
  }
}

/** Un solo cálculo/validación para tablero y reporte; nunca recibe cifras del cliente. */
export async function generateAnalyticalReport(auth: VerifiedAuthConnection, filters: unknown): Promise<AnalyticalReport> {
  const dashboard = await getDashboard(auth, filters);
  const normalized: DashboardQuery = { institutionId: dashboard.scope.institutionId,
    campusIds: dashboard.scope.campuses.map(row => row.id).sort(), careerId: dashboard.scope.career?.id ?? null,
    from: dashboard.period.from, to: dashboard.period.to, grouping: dashboard.grouping };
  const intervals = dashboardIntervals(normalized.from, normalized.to, normalized.grouping);
  try {
    // Transacción corta, después de consultar Mongo; comparte bloqueo con cambios de cuenta/asignaciones.
    return await withPostgresTransaction(async client => {
      const { profile, roles } = await lockAccountContext(client, auth.userId);
      if (!profile || profile.institucion_id !== normalized.institutionId || profile.campus_id !== auth.campusId) {
        throw new ApiError(409, 'CONFLICT', 'Tu contexto cambió. Vuelve a generar el reporte.');
      }
      const current = { ...auth, profile, roles, permissions: await readAnalyticsPermissions(client, auth.userId) };
      for (const id of normalized.campusIds) requireCampusCapability(current, id, 'reports');
      const report: AnalyticalReport = { ...dashboard, id: randomUUID(),
        generatedBy: { userId: auth.userId, name: profile.nombre_completo, email: await readReportAuthorEmail(client, auth.userId) }, calculationVersion: 'campuslink-kpi-v1' };
      await insertAnalyticalReport(client, report, normalized, intervals[0].from, intervals[intervals.length - 1].until);
      return report;
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo guardar el reporte. Inténtalo nuevamente.');
  }
}

/** Filtros históricos opcionales: no exige que el ámbito siga activo en los catálogos. */
export async function listHistoricalReports(auth: VerifiedAuthConnection, raw: unknown) {
  requireActiveAccount(auth.profile, auth.userId);
  const invalid = () => new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros del historial.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(key => !['institutionId','campusIds','careerId','from','to','grouping','limit','cursor'].includes(key))
    || Object.values(input).some(value => typeof value !== 'string')) throw invalid();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const institutionId = (input.institutionId as string | undefined)?.toLowerCase() ?? auth.profile.institucion_id;
  const campusIds = input.campusIds === undefined ? [] : [...new Set((input.campusIds as string).toLowerCase().split(','))];
  const careerId = (input.careerId as string | undefined)?.toLowerCase() ?? null;
  if (!uuid.test(institutionId) || campusIds.some(id => !uuid.test(id)) || (careerId !== null && !uuid.test(careerId))) throw invalid();
  const from = input.from === undefined ? null : dashboardDate(input.from);
  const to = input.to === undefined ? null : dashboardDate(input.to);
  const grouping = input.grouping ?? null;
  if ((from && to && from > to) || (grouping !== null && grouping !== 'week' && grouping !== 'month')
    || (input.limit !== undefined && !/^[1-9]\d?$/.test(input.limit as string))) throw invalid();
  const limit = input.limit === undefined ? 20 : Number(input.limit);
  if (limit > 50) throw invalid();
  let cursor: HistoricalReportsQuery['cursor'] = null;
  if (input.cursor !== undefined) {
    if ((input.cursor as string).length > 200) throw invalid();
    try {
      const parts = Buffer.from(input.cursor as string, 'base64url').toString('utf8').split('|');
      if (parts.length !== 2 || !uuid.test(parts[1]) || new Date(parts[0]).toISOString() !== parts[0]) throw invalid();
      cursor = { generatedAt: parts[0], id: parts[1] };
    } catch { throw invalid(); }
  }
  if (institutionId !== auth.profile.institucion_id) throw new ApiError(403, 'FORBIDDEN', 'No tienes autorización para esta institución.');
  const authorized = [...new Set(auth.roles.map(role => role.campusId))].filter(id => accountCapabilities(auth, id).reports);
  if (!authorized.length) throw new ApiError(403, 'FORBIDDEN', 'No tienes permiso de reportería.');
  for (const id of campusIds) requireCampusCapability(auth, id, 'reports');
  try {
    const rows = await withPostgresTransaction(client => readHistoricalReports(client,
      { institutionId, campusIds, careerId, from, to, grouping, limit, cursor }, authorized));
    const items = rows.slice(0, limit), last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last
      ? Buffer.from(`${last.generatedAt}|${last.id}`).toString('base64url') : null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar el historial. Inténtalo nuevamente.');
  }
}

/** Solo lee cifras guardadas; los permisos de consulta siempre son los vigentes. */
export async function getAnalyticalReport(auth: VerifiedAuthConnection, rawId: unknown): Promise<AnalyticalReport> {
  if (typeof rawId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Indica un identificador de reporte válido.');
  }
  requireActiveAccount(auth.profile, auth.userId);
  try {
    const report = await withPostgresTransaction(client => findAnalyticalReport(client, rawId, auth.profile.institucion_id));
    if (!report) throw new ApiError(404, 'NOT_FOUND', 'El reporte no está disponible.');
    if (report.scope.institutionId !== auth.profile.institucion_id || !report.scope.campuses.length) {
      throw new Error('Invalid stored report scope.');
    }
    for (const campus of report.scope.campuses) requireCampusCapability(auth, campus.id, 'reports');
    return report;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar el reporte guardado. Inténtalo nuevamente.');
  }
}

/** Autoriza el snapshot, genera bytes y comprueba permisos de nuevo antes de entregarlos. */
export async function exportAnalyticalReport(auth: VerifiedAuthConnection, rawId: unknown, rawFormat: unknown) {
  if (rawFormat !== 'pdf' && rawFormat !== 'xlsx') {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Selecciona formato pdf o xlsx.');
  }
  const report = await getAnalyticalReport(auth, rawId);
  try {
    const { renderReportExcel, renderReportPdf } = await import('./analytics.export.js');
    const { reportFilename } = await import('./analytics.presentation.js');
    const bytes = rawFormat === 'pdf' ? await renderReportPdf(report) : await renderReportExcel(report);
    // No mantener locks durante serialización; detectar revocación/suspensión durante la generación.
    await withPostgresTransaction(async client => {
      const { profile, roles } = await lockAccountContext(client, auth.userId);
      if (!profile || profile.institucion_id !== report.scope.institutionId || profile.campus_id !== auth.campusId) {
        throw new ApiError(403, 'FORBIDDEN', 'Tu contexto cambió. Vuelve a consultar el reporte.');
      }
      const current = { ...auth, profile, roles, permissions: await readAnalyticsPermissions(client, auth.userId) };
      for (const campus of report.scope.campuses) requireCampusCapability(current, campus.id, 'reports');
    });
    return { bytes, filename: reportFilename(report, rawFormat),
      contentType: rawFormat === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo exportar el reporte. Inténtalo nuevamente.');
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
