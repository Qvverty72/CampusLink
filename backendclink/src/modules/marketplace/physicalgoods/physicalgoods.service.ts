import { createModuleHealthCheck } from '../../../shared/health/module-health.js';
import { probePhysicalgoodsDependencies } from './physicalgoods.repository.js';
import type { PhysicalgoodsHealth } from './physicalgoods.types.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../shared/errors/api-error.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import type { PhysicalgoodsCatalog, PhysicalgoodsCreated } from './physicalgoods.types.js';
import { parsePhysicalgoods, physicalgoodsId } from './physicalgoods.validation.js';
import { auditPhysicalgoods, physicalgoodsSnapshot } from './physicalgoods.history.repository.js';
import { findPhysicalgoodsCatalog, findPrincipalPhoto, insertPhysicalgoods, lockPhysicalgoodsPublisher,
  PHYSICALGOODS_BUCKET, principalPhotoHasReference, removePrincipalPhoto, signPrincipalPhoto, uploadPrincipalPhoto, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';

const unavailable = () => new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo publicar el recurso. Inténtalo nuevamente.');
async function dependency<T>(operation: () => Promise<T>) {
  try { return await operation(); } catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
}
function validateCampus(auth: VerifiedAuthConnection, catalog: PhysicalgoodsCatalog) {
  if (!catalog.campus?.activo || catalog.campus.id !== auth.campusId || catalog.campus.institucion_id !== auth.profile.institucion_id) {
    throw new ApiError(403, 'FORBIDDEN', 'Tu campus no está disponible para publicar.');
  }
}
/** Obtiene catálogos disponibles para el campus actual después de verificar el permiso general. */
export async function getPhysicalgoodsOptions(auth: VerifiedAuthConnection) {
  requireCampusCapability(auth, auth.campusId, 'general');
  return dependency(() => withPhysicalgoodsTransaction(async client => {
    const catalog = await findPhysicalgoodsCatalog(client, auth.campusId);
    validateCampus(auth, catalog);
    return { campus: { id: catalog.campus!.id, name: catalog.campus!.nombre },
      categories: catalog.categories, careers: catalog.careers, subjects: catalog.subjects };
  }));
}

/**
 * Crea una publicación y su referencia de imagen, con auditoría dentro de la transacción SQL.
 * Sube primero a Storage para no retener bloqueos durante I/O y compensa archivos sin referencia ante fallos.
 */
export async function createPhysicalgoods(auth: VerifiedAuthConnection, body: unknown): Promise<PhysicalgoodsCreated> {
  requireCampusCapability(auth, auth.campusId, 'general');
  const { input, photo } = parsePhysicalgoods(body);
  const id = randomUUID();
  const extension = photo.mimeType === 'image/jpeg' ? 'jpg' : photo.mimeType === 'image/png' ? 'png' : 'webp';
  const path = `${auth.campusId}/${auth.userId}/${id}/principal.${extension}`;
  // Sube los bytes antes de abrir la transacción SQL para no mantener bloqueos durante I/O de red.
  // Ante carga fallida o ambigua, limpia la ruta única generada por el servidor si no tiene referencia.
  let attemptedPersistence = false;
  try {
    await uploadPrincipalPhoto(path, photo);
    attemptedPersistence = true;
    return await withPhysicalgoodsTransaction(async client => {
      const { profile, roles } = await lockPhysicalgoodsPublisher(client, auth.userId);
      if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) {
        throw new ApiError(409, 'CONFLICT', 'Tu campus cambió. Recarga el formulario antes de publicar.');
      }
      const current = { ...auth, campusId: profile.campus_id, profile, roles };
      requireCampusCapability(current, current.campusId, 'general');
      const catalog = await findPhysicalgoodsCatalog(client, current.campusId);
      validateCampus(current, catalog);
      const invalid = (field: string, message: string): never => { throw new ApiError(400, 'VALIDATION_ERROR', message, { details: [{ field, message }] }); };
      if (!catalog.categories.some(row => row.id === input.categoryId)) invalid('categoryId', 'Selecciona una categoría activa.');
      if (input.careerId && !catalog.careers.some(row => row.id === input.careerId)) invalid('careerId', 'Selecciona una carrera ofrecida en tu campus.');
      if (input.subjectId && !catalog.subjects.some(row => row.id === input.subjectId)) invalid('subjectId', 'Selecciona una asignatura ofrecida en tu campus.');
      const publication: PhysicalgoodsCreated = { ...input, id, campusId: current.campusId, ownerId: current.userId, status: 'DISPONIBLE', currency: 'CLP' };
      await insertPhysicalgoods(client, publication, photo, path);
      await auditPhysicalgoods(client, current, id, 'PUBLICAR_PUBLICACION', null, await physicalgoodsSnapshot(client, id));
      return publication;
    });
  } catch (error) {
    try {
      // COMMIT puede confirmarse y perderse su respuesta; conserva los bytes que ya tengan referencia.
      if (!attemptedPersistence || !await principalPhotoHasReference(path)) await removePrincipalPhoto(path);
    } catch { console.error('Physical resource photo cleanup unavailable', { publicationId: id }); }
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
}

/** Genera un enlace firmado de corta duración tras comprobar campus y referencia privada. */
export async function getPhysicalgoodsPhoto(auth: VerifiedAuthConnection, publicationId: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const id = physicalgoodsId(publicationId, 'publicationId');
  return dependency(async () => {
    const photo = await withPhysicalgoodsTransaction(client => findPrincipalPhoto(client, id, auth.campusId));
    if (!photo || photo.bucket_id !== PHYSICALGOODS_BUCKET || !photo.storage_path.startsWith(auth.campusId + '/')) {
      throw new ApiError(404, 'NOT_FOUND', 'La fotografía no está disponible en tu campus.');
    }
    return { url: await signPrincipalPhoto(photo.storage_path), expiresIn: 60 };
  });
}

export const getPhysicalgoodsHealth: () => Promise<PhysicalgoodsHealth> =
  createModuleHealthCheck('physicalgoods', probePhysicalgoodsDependencies);
