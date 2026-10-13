import { ApiError } from '../../services/apiError.js';
import { createPaginatedResult } from '../../services/pagination.js';
import { requireActiveAccount, requireCampusCapability } from '../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import type { ActivityDocument } from '../activities/activities.types.js';
import type { ValidationResult } from '../../types/api.js';
import type { ReviewDependencies, ReviewDetail, ReviewRecord, ReviewTargetType } from './reports.review.types.js';
import type { reviewRepository } from './reports.review.repository.js';
import { parseReviewParams, parseReviewQuery, reviewUuid } from './reports.review.validation.js';

type Repository = ReturnType<typeof reviewRepository>;
function validated<T>(result: ValidationResult<T>): T {
  if (!result.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los filtros e identificadores.', { details: result.issues });
  return result.data;
}
async function read<T>(dependencies: ReviewDependencies, operation: (repository: Repository) => Promise<T>): Promise<T> {
  try {
    const transaction = dependencies.transaction ?? (await import('./reports.review.repository.js')).withReviewTransaction;
    return await transaction(operation);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar la denuncia.');
  }
}
async function activeActor(repository: Repository, auth: VerifiedAuthConnection) {
  const actor = await repository.actor(auth.userId);
  if (!actor) throw new ApiError(403, 'FORBIDDEN', 'La cuenta ya no está disponible.');
  requireActiveAccount(actor, auth.userId);
  return actor;
}
async function authorize(repository: Repository, auth: VerifiedAuthConnection, campusId: string) {
  const actor = await activeActor(repository, auth);
  const roles = await repository.access.adminAssignments(auth.userId);
  requireCampusCapability({ ...auth, profile: { ...auth.profile, ...actor }, roles }, campusId, 'administration');
  const campus = await repository.access.lockCampus(campusId);
  if (!campus?.activo) throw new ApiError(403, 'FORBIDDEN', 'El campus no está disponible para moderación.');
  return campus;
}
export function listReviewCampuses(auth: VerifiedAuthConnection, dependencies: ReviewDependencies = {}) {
  return read(dependencies, async repository => {
    await activeActor(repository, auth);
    const roles = await repository.access.adminAssignments(auth.userId);
    if (!roles.length) throw new ApiError(403, 'FORBIDDEN', 'Se requiere un administrador con campus vigente.');
    return (await repository.access.campuses([...new Set(roles.map(role => role.campusId))]))
      .filter(campus => campus.activo).map(campus => ({ id: campus.id, name: campus.nombre }));
  });
}
export function listReviewReports(auth: VerifiedAuthConnection, rawCampusId: unknown, rawQuery: unknown,
  dependencies: ReviewDependencies = {}) {
  const { campusId } = validated(parseReviewParams({ campusId: rawCampusId }));
  const query = validated(parseReviewQuery(rawQuery));
  return read(dependencies, async repository => {
    await authorize(repository, auth, campusId);
    return createPaginatedResult(await repository.list(campusId, query), query);
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const source = record(value);
  if (!source) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const item = source[key];
    if (item instanceof Date && Number.isFinite(item.getTime())) result[key] = item.toISOString();
    else if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) result[key] = item;
  }
  return result;
}
const publicationFields = ['id', 'campusId', 'ownerId', 'resourceType', 'title', 'description', 'modality', 'price', 'currency',
  'status', 'publishedAt', 'updatedAt', 'deletedAt', 'categoryId', 'condition'];
const activityFields = ['id', 'campusId', 'createdByUserId', 'title', 'description', 'type', 'status', 'visibility',
  'startAt', 'endAt', 'createdAt', 'updatedAt', 'deletedAt', 'revision', 'category'];
const exchangeFields = ['id', 'requestId', 'publicationId', 'ownerId', 'recipientId', 'status', 'modality', 'amount', 'currency',
  'startedAt', 'completedAt', 'cancelledAt', 'cancelledById', 'cancellationReason', 'cancellationDetail', 'requestStatus'];

/** Explicit metadata projection also protects legacy evidence from leaking storage links or credentials. */
export function reviewEvidence(value: unknown, type: ReviewTargetType): Record<string, unknown> | null {
  const source = record(value);
  if (!source) return null;
  const result = fields(source, type === 'ACTIVIDAD' ? activityFields : type === 'TRANSACCION' ? exchangeFields : publicationFields)!;
  if (type === 'TRANSACCION') {
    const publication = fields(source.publication, publicationFields);
    if (publication) result.publication = publication;
    if (Array.isArray(source.confirmations)) result.confirmations = source.confirmations
      .map(item => fields(item, ['userId', 'role', 'confirmedAt'])).filter(item => item !== null);
  }
  if (type === 'ACTIVIDAD') {
    const location = fields(source.location, ['buildingKey', 'buildingName', 'floorKey', 'floorName', 'poiKey', 'poiName', 'customLabel']);
    if (location) {
      const coordinates = fields(record(source.location)?.coordinates, ['x', 'y', 'z']);
      if (coordinates) location.coordinates = coordinates;
      result.location = location;
    }
    const series = fields(source.series, ['id', 'index', 'total']);
    if (series) result.series = series;
    if (Array.isArray(source.tags)) result.tags = source.tags.filter(tag => typeof tag === 'string');
  }
  return Object.keys(result).length ? result : null;
}
function activityContext(document: ActivityDocument, report: Pick<ReviewRecord, 'campusId' | 'targetId'>) {
  if (document.campusId !== report.campusId || document._id.toHexString() !== report.targetId.toLowerCase()) return null;
  return reviewEvidence({ ...document, id: document._id.toHexString(), revision: document.editRevision }, 'ACTIVIDAD');
}
function participantIds(...contexts: (Record<string, unknown> | null)[]): string[] {
  return [...new Set(contexts.flatMap(context => [context?.ownerId, context?.recipientId])
    .filter((id): id is string => typeof id === 'string' && reviewUuid.test(id)))];
}
export async function getReviewReport(auth: VerifiedAuthConnection, rawCampusId: unknown, rawReportId: unknown,
  dependencies: ReviewDependencies = {}): Promise<ReviewDetail> {
  if (typeof rawReportId !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'Identificador de denuncia inválido.');
  const { campusId, reportId } = validated(parseReviewParams({ campusId: rawCampusId, reportId: rawReportId }));
  // First SQL read authorizes before obtaining any report or participant data.
  const detail = await read<ReviewDetail>(dependencies, async repository => {
    await authorize(repository, auth, campusId);
    const row = await repository.detail(campusId, reportId!);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'La denuncia no está disponible en este campus.');
    const snapshot = reviewEvidence(row.snapshot, row.targetType);
    let current: Record<string, unknown> | null = null;
    if (reviewUuid.test(row.targetId)) {
      if (row.targetType === 'TRANSACCION') current = await repository.exchange(campusId, row.targetId);
      else if (row.targetType === 'PUBLICACION_FISICA' || row.targetType === 'PUBLICACION_DIGITAL') {
        current = await repository.publication(campusId, row.targetId, row.targetType === 'PUBLICACION_FISICA');
      }
    }
    current = reviewEvidence(current, row.targetType);
    const ids = row.targetType === 'TRANSACCION' ? participantIds(snapshot, current) : [];
    const people = await repository.people([...new Set([row.reporterId, ...ids])]);
    const { reporterId, snapshot: _stored, ...summary } = row;
    return { ...summary, reporter: people.find(person => person.id === reporterId) ?? { id: reporterId, name: null },
      snapshot, current, participants: ids.map(id => people.find(person => person.id === id) ?? { id, name: null }),
      activityChanges: [] };
  });
  if (detail.targetType !== 'ACTIVIDAD' || !/^[0-9a-f]{24}$/i.test(detail.targetId)) return detail;
  // No SQL locks during Mongo IO. Recheck authorization after it, before delivering evidence.
  try {
    const find = dependencies.findReportedActivity ?? (await import('./reports.review.repository.js')).findReportedActivity;
    const document = await find(campusId, detail.targetId);
    if (document) {
      const current = activityContext(document, detail);
      if (current) {
        detail.current = current;
        detail.activityChanges = (document.changeHistory ?? []).filter(change => change.campusId === campusId
          && change.activityId.toHexString() === detail.targetId).map(change => ({
          revision: change.revision, actorUserId: change.actorUserId, changedAt: change.changedAt.toISOString(),
          changedFields: change.changedFields,
          before: reviewEvidence(change.before, 'ACTIVIDAD'), after: reviewEvidence(change.after, 'ACTIVIDAD'),
        }));
      }
    }
  } catch {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudieron consultar los antecedentes de la actividad.');
  }
  await read(dependencies, async repository => { await authorize(repository, auth, campusId); });
  return detail;
}
