import { createModuleHealthCheck } from '../../../../shared/health/module-health.js';
import { probeElibraryDependencies } from '../repositories/elibrary.repository.js';
import type { ElibraryHealth } from '../types/elibrary.types.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../../../../shared/errors/api-error.js';
import { withPostgresTransaction } from '../../../../database/supabase/postgres.js';
import { requireCampusCapability } from '../../../auth/domain/auth.authorization.js';
import { lockAccountContext } from '../../../auth/repositories/auth.repository.js';
import type { VerifiedAuthConnection } from '../../../auth/types/auth.types.js';
import type { DigitalPublication, DigitalUpload } from '../types/elibrary.types.js';
import { digitalId, parseDigitalInput, validateDigitalAcademics, validateDigitalFile } from '../validators/elibrary.validation.js';
import { auditDigitalAcademics, findDigitalAcademicCatalog, replaceDigitalAcademics } from '../repositories/elibrary.academics.repository.js';
import { digitalFileHasReference, findDigitalCampus, findDigitalPublications, findDigitalOwnerSummary, insertDigitalPublication,
  lockDigitalPersistence, removeDigitalFile, uploadDigitalFile } from '../repositories/elibrary.repository.js';

const unavailable = () => new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo completar la operación.');
export function authorizeDigitalAccess(auth: VerifiedAuthConnection) {
  requireCampusCapability(auth, auth.campusId, 'general');
}
export async function currentDigitalContext(client: PoolClient, auth: VerifiedAuthConnection) {
  const { profile, roles } = await lockAccountContext(client, auth.userId);
  if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) {
    throw new ApiError(409, 'CONFLICT', 'Tu contexto institucional cambió. Recarga la biblioteca.');
  }
  const current = { ...auth, profile, roles, campusId: profile.campus_id };
  requireCampusCapability(current, current.campusId, 'general');
  const campus = await findDigitalCampus(client, current.campusId);
  if (!campus?.activo || campus.institucion_id !== profile.institucion_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Tu campus no está disponible.');
  }
  return { current, campus };
}
export async function createDigitalPublication(auth: VerifiedAuthConnection, raw: unknown, upload?: DigitalUpload): Promise<DigitalPublication> {
  requireCampusCapability(auth, auth.campusId, 'general');
  const input = parseDigitalInput(raw), file = await validateDigitalFile(upload);
  // Rechaza selecciones inválidas antes de cargar bytes; se comprueban de nuevo tras Storage.
  if (input.careerIds.length || input.subjectIds.length) {
    try {
      await withPostgresTransaction(async client => {
        const { campus } = await currentDigitalContext(client, auth);
        validateDigitalAcademics(input, await findDigitalAcademicCatalog(client, campus.institucion_id));
      });
    } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
  }
  const id = randomUUID(), path = `${auth.campusId}/${auth.userId}/${id}/${randomUUID()}.pdf`;
  let persistenceAttempted = false, saved: DigitalPublication | undefined;
  try {
    await uploadDigitalFile(path, file);
    persistenceAttempted = true;
    return await withPostgresTransaction(async client => {
      const { current, campus } = await currentDigitalContext(client, auth);
      await lockDigitalPersistence(client, id);
      validateDigitalAcademics(input, await findDigitalAcademicCatalog(client, campus.institucion_id));
      await insertDigitalPublication(client, { ...input, id, ownerId: current.userId, campusId: campus.id }, file, path);
      await replaceDigitalAcademics(client, id, input.careerIds, input.subjectIds);
      saved = (await findDigitalPublications(client, campus.institucion_id, id))[0];
      await auditDigitalAcademics(client, current, null, saved);
      return saved;
    });
  } catch (error) {
    try {
      const referenced = persistenceAttempted && await digitalFileHasReference(id, path);
      if (referenced && saved) return saved;
      if (!referenced) await removeDigitalFile(path);
    } catch { console.error('Digital resource reconciliation required', { publicationId: id }); }
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}
export async function getDigitalPublications(auth: VerifiedAuthConnection, publicationId?: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const id = publicationId === undefined ? null : digitalId(publicationId);
  try {
    return await withPostgresTransaction(async client => {
      const { campus } = await currentDigitalContext(client, auth);
      const publications = await findDigitalPublications(client, campus.institucion_id, id, undefined, auth.userId);
      if (id && !publications.length) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu institución.');
      if (id) {
        const owner = await findDigitalOwnerSummary(client, id, campus.institucion_id);
        if (!owner) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu institución.');
        publications[0] = { ...publications[0], owner };
      }
      return publications;
    });
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}

export const getElibraryHealth: () => Promise<ElibraryHealth> =
  createModuleHealthCheck('elibrary', probeElibraryDependencies);
