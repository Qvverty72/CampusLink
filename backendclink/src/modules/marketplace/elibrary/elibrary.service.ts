import { createModuleHealthCheck } from '../../../services/module-health.js';
import { probeElibraryDependencies } from './elibrary.repository.js';
import type { ElibraryHealth } from './elibrary.types.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import { lockAccountContext } from '../../auth/auth.repository.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import type { DigitalPublication, DigitalUpload } from './elibrary.types.js';
import { digitalId, parseDigitalInput, validateDigitalFile } from './elibrary.validation.js';
import { digitalFileHasReference, findDigitalCampus, findDigitalPublications, insertDigitalPublication,
  lockDigitalPersistence, removeDigitalFile, uploadDigitalFile } from './elibrary.repository.js';

const unavailable = () => new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo completar la operación.');
export function authorizeDigitalAccess(auth: VerifiedAuthConnection) {
  requireCampusCapability(auth, auth.campusId, 'general');
}
async function currentDigitalContext(client: PoolClient, auth: VerifiedAuthConnection) {
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
  const id = randomUUID(), path = `${auth.campusId}/${auth.userId}/${id}/${randomUUID()}.pdf`;
  let persistenceAttempted = false, saved: DigitalPublication | undefined;
  try {
    await uploadDigitalFile(path, file);
    persistenceAttempted = true;
    return await withPostgresTransaction(async client => {
      await lockDigitalPersistence(client, id);
      const { current, campus } = await currentDigitalContext(client, auth);
      saved = { ...input, id, ownerId: current.userId, campusId: campus.id, campusName: campus.nombre,
        institutionId: campus.institucion_id, status: 'DISPONIBLE', currency: 'CLP',
        files: [{ name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.length }] };
      await insertDigitalPublication(client, saved, file, path);
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
      const publications = await findDigitalPublications(client, campus.institucion_id, id);
      if (id && !publications.length) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu institución.');
      return publications;
    });
  } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}

export const getElibraryHealth: () => Promise<ElibraryHealth> =
  createModuleHealthCheck('elibrary', probeElibraryDependencies);
