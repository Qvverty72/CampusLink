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
import { findReportedDigitalFile, findReportReview, readReportBackground, readReportReviews } from './reports.review.repository.js';

const missing = () => new ApiError(404, 'NOT_FOUND', 'La denuncia o el archivo no está disponible en este campus.');

/** Reutiliza el bloqueo de cuenta y roles: una sesión previa no sobrevive a una revocación. */
async function authorizedReview<T>(auth: VerifiedAuthConnection, campusId: string,
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
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo consultar la denuncia. Inténtalo nuevamente.');
  }
}

export async function listReportReviews(auth: VerifiedAuthConnection, rawCampusId: unknown, query: unknown,
  transaction = withPostgresTransaction) {
  const campusId = digitalId(rawCampusId, 'campusId');
  const parsed = parsePaginationQuery(query);
  if (!parsed.success || !query || typeof query !== 'object' || Object.keys(query).some(key => !['page', 'limit'].includes(key))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa la página y el tamaño del listado.');
  }
  return authorizedReview(auth, campusId, async client =>
    createPaginatedResult(await readReportReviews(client, campusId, parsed.data), parsed.data), transaction);
}

export async function getReportReview(auth: VerifiedAuthConnection, rawCampusId: unknown, rawId: unknown,
  transaction = withPostgresTransaction) {
  const campusId = digitalId(rawCampusId, 'campusId'), id = digitalId(rawId, 'reportId');
  return authorizedReview(auth, campusId, async client => {
    const report = await findReportReview(client, campusId, id);
    if (!report) throw missing();
    return { ...report, ...await readReportBackground(client, report) };
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
