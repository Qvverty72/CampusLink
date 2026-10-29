import type { PoolClient } from 'pg';
import { withPostgresTransaction } from '../../database/supabase/postgres.js';
import { ApiError } from '../../services/apiError.js';
import { createPaginatedResult, parsePaginationQuery } from '../../services/pagination.js';
import { requireCampusCapability } from '../auth/auth.authorization.js';
import { lockAccountContext } from '../auth/auth.repository.js';
import { accessRepository } from '../users/access.repository.js';
import type { VerifiedAuthConnection } from '../auth/auth.types.js';
import { digitalId } from '../marketplace/elibrary/elibrary.validation.js';
import { assertStoredDigitalFile } from '../marketplace/elibrary/elibrary.files.service.js';
import { downloadDigitalOriginal, findDigitalResource } from '../marketplace/elibrary/elibrary.repository.js';
import { findReportedDigitalFile, findReportReview, readReportBackground, readReportReviews, readReportResolutions, findReportResolution, readReportPeople } from './reports.review.repository.js';
import type { ReportStatus } from './reports.types.js';

const missing = () => new ApiError(404, 'NOT_FOUND', 'La denuncia o el archivo no está disponible en este campus.');

/** Reutiliza el bloqueo de cuenta y roles: una sesión previa no sobrevive a una revocación. */
export async function authorizedReview<T>(auth: VerifiedAuthConnection, campusId: string,
  operation: (client: PoolClient, institutionId: string) => Promise<T>, transaction = withPostgresTransaction): Promise<T> {
  try {
    return await transaction(async client => {
      const { profile, roles } = await lockAccountContext(client, auth.userId);
      if (!profile) throw new ApiError(403, 'FORBIDDEN', 'Se requiere una cuenta activa.');
      requireCampusCapability({ ...auth, profile, roles, campusId: profile.campus_id }, campusId, 'administration');
      const campus = await accessRepository(client).lockCampus(campusId);
      if (!campus?.activo) throw new ApiError(403, 'FORBIDDEN', 'El campus no está disponible.');
      return operation(client, campus.institucion_id);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar la operación. Recarga la denuncia para consultar su estado.');
  }
}

function reviewListQuery(rawCampusId: unknown, query: unknown, allowStatus = false) {
  const campusId = digitalId(rawCampusId, 'campusId');
  const parsed = parsePaginationQuery(query);
  if (!parsed.success || !query || typeof query !== 'object' || Array.isArray(query) || Object.keys(query).some(key => !['page', 'limit', ...(allowStatus ? ['status'] : [])].includes(key))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa la página y el tamaño del listado.');
  }
  const status = (query as Record<string, unknown>).status;
  if (status !== undefined && (typeof status !== 'string' || !['PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO'].includes(status))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Selecciona un estado de denuncia válido.');
  }
  return { campusId, pagination: parsed.data, status: status as ReportStatus | undefined };
}

export async function listReportReviews(auth: VerifiedAuthConnection, rawCampusId: unknown, query: unknown,
  transaction = withPostgresTransaction) {
  const { campusId, pagination, status } = reviewListQuery(rawCampusId, query, true);
  return authorizedReview(auth, campusId, async client =>
    createPaginatedResult(await readReportReviews(client, campusId, pagination, status), pagination), transaction);
}

export async function listReportResolutions(auth: VerifiedAuthConnection, rawCampusId: unknown, query: unknown,
  transaction = withPostgresTransaction) {
  const { campusId, pagination } = reviewListQuery(rawCampusId, query);
  return authorizedReview(auth, campusId, async client =>
    createPaginatedResult(await readReportResolutions(client, campusId, pagination), pagination), transaction);
}

export async function getReportResolution(auth: VerifiedAuthConnection, rawCampusId: unknown, rawId: unknown,
  transaction = withPostgresTransaction) {
  const campusId = digitalId(rawCampusId, 'campusId'), id = digitalId(rawId, 'reportId');
  return authorizedReview(auth, campusId, async client => {
    const report = await findReportResolution(client, campusId, id);
    if (!report) throw missing();
    return { ...report, people: await readReportPeople(client, report) };
  }, transaction);
}

export async function getReportReview(auth: VerifiedAuthConnection, rawCampusId: unknown, rawId: unknown,
  transaction = withPostgresTransaction) {
  const campusId = digitalId(rawCampusId, 'campusId'), id = digitalId(rawId, 'reportId');
  return authorizedReview(auth, campusId, async client => {
    const report = await findReportReview(client, campusId, id);
    if (!report) throw missing();
    // La lectura unificada conserva el contrato histórico de los casos finalizados.
    if (['RESUELTO', 'DESESTIMADO'].includes(report.status)) {
      const resolution = await findReportResolution(client, campusId, id);
      if (!resolution) throw missing();
      return { ...resolution, people: await readReportPeople(client, resolution) };
    }
    return { ...report, ...await readReportBackground(client, report), people: await readReportPeople(client, report) };
  }, transaction);
}

/** Solo permite archivos presentes en la instantánea y vinculados al recurso/campus del caso. */
export async function getReportedOriginal(auth: VerifiedAuthConnection, rawCampusId: unknown, rawId: unknown, rawFileId: unknown,
  transaction = withPostgresTransaction, download = downloadDigitalOriginal) {
  const campusId = digitalId(rawCampusId, 'campusId'), id = digitalId(rawId, 'reportId'), fileId = digitalId(rawFileId, 'fileId');
  const read = () => authorizedReview(auth, campusId, async (client, institutionId) => {
    const report = await findReportReview(client, campusId, id);
    const publication = report?.snapshot?.publication;
    if (!report || !['PUBLICACION_DIGITAL', 'TRANSACCION'].includes(report.entityType) || publication?.tipo_recurso !== 'DIGITAL'
      || !Array.isArray(publication.files) || !publication.files.some((file: { id?: string }) => file?.id === fileId)) throw missing();
    const publicationId = digitalId(publication.id, 'publicationId');
    if (report.entityType === 'PUBLICACION_DIGITAL' && report.entityId !== publicationId) throw missing();
    if (report.entityType === 'TRANSACCION' && report.snapshot?.transaction?.id !== report.entityId) throw missing();
    const resource = await findDigitalResource(client, publicationId, institutionId);
    if (!resource || resource.campus_id !== campusId) throw missing();
    const file = await findReportedDigitalFile(client, publicationId, fileId);
    assertStoredDigitalFile(resource, file);
    return file;
  }, transaction);
  try {
    const file = await read(), bytes = await download(file);
    // No mantener locks durante Storage; comprobar permisos y archivo otra vez antes de entregar bytes.
    const current = await read();
    if (JSON.stringify(current) !== JSON.stringify(file)) throw missing();
    return { bytes, name: current.nombre_original };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo descargar el archivo de la denuncia.');
  }
}
