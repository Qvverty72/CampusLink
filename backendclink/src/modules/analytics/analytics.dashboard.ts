import { ApiError } from '../../services/api-response.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { countActivityInteractions, readDashboardMetrics } from './analytics.repository.js';

export interface DashboardQuery { campusId: string; from: string; to: string }

function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Indica fechas válidas en formato AAAA-MM-DD.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Indica fechas válidas en formato AAAA-MM-DD.');
  }
  return value;
}

/** Mantiene un contrato de consulta cerrado; el fin civil se convierte en límite exclusivo. */
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
  const from = date(query.from);
  const to = date(query.to);
  if (from > to) throw new ApiError(400, 'VALIDATION_ERROR', 'La fecha inicial debe ser anterior a la final.');
  return { campusId: campusId.toLowerCase(), from, to };
}

export async function getDashboard(auth: VerifiedAuthConnection, rawQuery: unknown) {
  const query = parseDashboardQuery(rawQuery, auth.campusId);
  requireCampusCapability(auth, query.campusId, 'reports');
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const until = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86_400_000);
  try {
    const sql = await readDashboardMetrics(query.campusId, auth.profile.institucion_id, from, until);
    if (!sql.scope) throw new ApiError(403, 'FORBIDDEN', 'No tienes autorización para este campus.');
    const activities = await countActivityInteractions(query.campusId, from, until);
    const scope = { institutionId: sql.scope.institutionId, institutionName: sql.scope.institutionName,
      campusId: query.campusId, campusName: sql.scope.campusName };
    const period = { from: query.from, to: query.to, timeZone: 'UTC', cutoff: until.toISOString() };
    const metric = (value: number) => ({ value, period, scope });
    return { period, scope, generatedAt: new Date().toISOString(),
      activeUsers: metric(sql.activeUsers),
      resourceDemand: { ...metric(sql.resourceDemand.views + sql.resourceDemand.requests), ...sql.resourceDemand },
      subjectDemand: { ...metric(sql.subjectDemand.reduce((sum, row) => sum + row.views + row.requests, 0)),
        subjects: sql.subjectDemand },
      activityParticipation: { ...metric(activities.joined), label: 'Inscripciones registradas' } };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar el tablero. Inténtalo nuevamente.');
  }
}
