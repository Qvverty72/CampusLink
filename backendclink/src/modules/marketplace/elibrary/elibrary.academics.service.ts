import { ApiError } from '../../../shared/errors/api-error.js';
import { notifyResourceUpdated } from '../repositories/marketplace.notifications.js';
import { withPostgresTransaction } from '../../../database/supabase/postgres.js';
import type { VerifiedAuthConnection } from '../../auth/types/auth.types.js';
import { authorizeDigitalAccess, currentDigitalContext } from './elibrary.service.js';
import { findDigitalPublications, findDigitalResource, lockDigitalPersistence } from './elibrary.repository.js';
import { auditDigitalAcademics, findDigitalAcademicCatalog, replaceDigitalAcademics } from './elibrary.academics.repository.js';
import { digitalId, parseDigitalAcademics, validateDigitalAcademics } from './elibrary.validation.js';
export async function getDigitalAcademicCatalog(auth: VerifiedAuthConnection) {
  authorizeDigitalAccess(auth);
  try {
    return await withPostgresTransaction(async client => {
      const { campus } = await currentDigitalContext(client, auth);
      return findDigitalAcademicCatalog(client, campus.institucion_id);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo cargar el catálogo académico.');
  }
}
/** Editor acotado a asociaciones; no sustituye el editor general de F2.5-09. */
export async function updateDigitalAcademics(auth: VerifiedAuthConnection, rawId: unknown, raw: unknown) {
  authorizeDigitalAccess(auth);
  const id = digitalId(rawId), input = parseDigitalAcademics(raw);
  try {
    return await withPostgresTransaction(async client => {
      const { current, campus } = await currentDigitalContext(client, auth);
      await lockDigitalPersistence(client, id);
      const resource = await findDigitalResource(client, id, campus.institucion_id);
      if (!resource) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu institución.');
      if (resource.propietario_id !== current.userId) throw new ApiError(403, 'FORBIDDEN', 'Solo el propietario puede editar las asociaciones.');
      if (resource.deleted_at || resource.estado_publicacion !== 'DISPONIBLE') throw new ApiError(409, 'CONFLICT', 'La publicación ya no está disponible para editar.');
      const before = (await findDigitalPublications(client, campus.institucion_id, id))[0];
      if (!before || before.updatedAt !== input.updatedAt) throw new ApiError(409, 'CONFLICT', 'La publicación cambió. Recarga el detalle antes de editar.');
      validateDigitalAcademics(input, await findDigitalAcademicCatalog(client, campus.institucion_id));
      const sameIds = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify(right);
      if (sameIds(before.careerIds, input.careerIds) && sameIds(before.subjectIds, input.subjectIds)) return before;
      await replaceDigitalAcademics(client, id, input.careerIds, input.subjectIds);
      const after = (await findDigitalPublications(client, campus.institucion_id, id))[0];
      await auditDigitalAcademics(client, current, before, after);
      await notifyResourceUpdated(client,id);
      return after;
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Ante un COMMIT incierto se exige recargar; nunca se reenvía automáticamente la edición.
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo confirmar el cambio. Recarga la publicación antes de reintentar.');
  }
}
