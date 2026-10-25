import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult } from '../../../services/pagination.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import type { PhysicalgoodsMediaRow } from './physicalgoods.types.js';
import { parsePhysicalgoodsCategory, parsePhysicalgoodsPhotoUpload, physicalgoodsId, PHYSICALGOODS_MAX_IMAGES } from './physicalgoods.validation.js';
import { lockPhysicalgoodsPublisher, PHYSICALGOODS_BUCKET, principalPhotoHasReference, removePrincipalPhoto,
  signPhysicalgoodsSearchPhotos, signPrincipalPhoto, uploadPrincipalPhoto, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { parsePhysicalgoodsSearch } from './physicalgoods.search.validation.js';
import { auditPhysicalgoods, physicalgoodsSnapshot } from './physicalgoods.history.repository.js';
import {findPhysicalgoodsOriginalTerms} from './physicalgoods.price-history.repository.js';
import { findPhysicalgoodsCategory, findPhysicalgoodsDetail, findPhysicalgoodsImages, findPhysicalgoodsMedia, findPhysicalgoodsOwnerReputation, insertPhysicalgoodsImage, listPhysicalgoodsMedia,
  retirePhysicalgoodsImage, setPhysicalgoodsPrincipal, touchPhysicalgoods, updatePhysicalgoodsCategory } from './physicalgoods.images.repository.js';

async function dependency<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'No se pudo completar la operación.');
  }
}
function canEdit(auth: VerifiedAuthConnection, row: PhysicalgoodsMediaRow) {
  return row.propietario_id === auth.userId || auth.roles.some(role => role.campusId === row.campus_id && role.name === 'ADMINISTRADOR');
}
function mediaDto(row: PhysicalgoodsMediaRow) {
  return { id: row.id, title: row.titulo, category: { id: row.categoria_id, name: row.categoria_nombre },
    modality: row.modalidad, price: row.modalidad === 'VENTA' ? Number(row.precio) : null, status: row.estado_publicacion, condition: row.estado_uso };
}
/**
 * Revalida perfil, campus y permisos bajo bloqueo antes de modificar una publicación.
 * Las llamadas de contenido/retirada pueden exigir propietario; otras operaciones admiten admin del campus.
 */
export async function editPhysicalgoods<T>(auth: VerifiedAuthConnection, id: string, operation: (client: PoolClient, row: PhysicalgoodsMediaRow) => Promise<T>, ownerOnly = false) {
  requireCampusCapability(auth, auth.campusId, 'general');
  return withPhysicalgoodsTransaction(async client => {
    const { profile, roles } = await lockPhysicalgoodsPublisher(client, auth.userId);
    if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) throw new ApiError(409, 'CONFLICT', 'Tu contexto cambió. Recarga la publicación.');
    const current = { ...auth, profile, roles, campusId: profile.campus_id };
    requireCampusCapability(current, current.campusId, 'general');
    const row = await findPhysicalgoodsMedia(client, id, current.campusId, true);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu campus.');
    if (row.propietario_id !== current.userId) {
      if (ownerOnly) throw new ApiError(403, 'FORBIDDEN', 'Solo el propietario puede editar o retirar esta publicación.');
      requireCampusCapability(current, row.campus_id, 'administration');
    }
    const before = await physicalgoodsSnapshot(client, id);
    const result = await operation(client, row);
    const after = await physicalgoodsSnapshot(client, id);
    if (JSON.stringify(before) !== JSON.stringify(after)) await auditPhysicalgoods(client, current, id,
      after.deleted_at ? 'RETIRAR_PUBLICACION' : 'EDITAR_PUBLICACION', before, after);
    return result;
  });
}
/** Devuelve metadatos y enlaces firmados de imágenes válidas de una publicación del campus. */
export async function getPhysicalgoodsGallery(auth: VerifiedAuthConnection, publicationId: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const id = physicalgoodsId(publicationId, 'publicationId');
  return dependency(async () => {
    const result = await withPhysicalgoodsTransaction(async client => {
      const row = await findPhysicalgoodsDetail(client, id, auth.campusId);
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu campus.');
      return { row, originalTerms:await findPhysicalgoodsOriginalTerms(client,id), images: await findPhysicalgoodsImages(client, id), reputation: await findPhysicalgoodsOwnerReputation(client, row.propietario_id, row.campus_id) };
    });
    const images = [];
    for (const image of result.images) {
      if (image.bucket_id !== PHYSICALGOODS_BUCKET || !image.storage_path.startsWith(auth.campusId + '/')) throw new Error('Invalid stored image');
      images.push({ id: image.id, name: image.nombre_original, principal: image.orden === 0, url: await signPrincipalPhoto(image.storage_path) });
    }
    return { ...mediaDto(result.row), originalTerms:result.originalTerms, description: result.row.descripcion,
      campus: { id: result.row.campus_id, name: result.row.campus_nombre },
      owner: { id: result.row.propietario_id, fullName: result.row.propietario_nombre, careers: result.row.propietario_carreras, ...result.reputation },
      acceptsRequests: result.row.estado_publicacion === 'DISPONIBLE', updatedAt: result.row.updated_at,
      canEdit: canEdit(auth, result.row), images, expiresIn: 60 };
  });
}
/** Busca publicaciones disponibles del campus, pagina antes de firmar sus imágenes y aplica filtros del usuario. */
export async function getPhysicalgoodsResources(auth: VerifiedAuthConnection, query: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const { filters, pagination } = parsePhysicalgoodsSearch(query);
  return dependency(async () => {
    const rows = await withPhysicalgoodsTransaction(client => listPhysicalgoodsMedia(client, auth.campusId, filters, filters.mine ? auth.userId : null, pagination));
    const result = createPaginatedResult(rows, pagination);
    for (const row of result.data) {
      if (row.photo_storage_path && (row.photo_bucket_id !== PHYSICALGOODS_BUCKET || !row.photo_storage_path.startsWith(auth.campusId + '/'))) throw new Error('Invalid stored photo');
    }
    const paths = [...new Set(result.data.flatMap(row => row.photo_storage_path ? [row.photo_storage_path] : []))];
    const urls = await signPhysicalgoodsSearchPhotos(paths);
    return { data: result.data.map(row => ({ ...mediaDto(row), imageUrl: row.photo_storage_path ? urls.get(row.photo_storage_path) ?? null : null })), meta: result.meta };
  });
}
/** Cuenta solo imágenes activas; debe ejecutarse con el lock de publicación de editPhysicalgoods. */
async function requirePhysicalgoodsImageSlot(client: PoolClient, publicationId: string) {
  const images = await findPhysicalgoodsImages(client, publicationId);
  if (images.length >= PHYSICALGOODS_MAX_IMAGES) throw new ApiError(409, 'CONFLICT',
    `Cada publicación admite un máximo de ${PHYSICALGOODS_MAX_IMAGES} imágenes. Quita una antes de agregar otra.`);
  return images;
}
export async function addPhysicalgoodsImage(auth: VerifiedAuthConnection, publicationId: unknown, body: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const id = physicalgoodsId(publicationId, 'publicationId'), photo = parsePhysicalgoodsPhotoUpload(body), imageId = randomUUID();
  const extension = photo.mimeType === 'image/jpeg' ? 'jpg' : photo.mimeType === 'image/png' ? 'png' : 'webp';
  const path = `${auth.campusId}/${auth.userId}/${id}/${imageId}.${extension}`;
  // Comprueba acceso/cupo antes de Storage; la segunda comprobación cubre altas simultáneas durante la carga.
  await dependency(() => editPhysicalgoods(auth, id, client => requirePhysicalgoodsImageSlot(client, id)));
  let attemptedPersistence = false;
  return dependency(async () => {
    try {
      await uploadPrincipalPhoto(path, photo);
      attemptedPersistence = true;
      await editPhysicalgoods(auth, id, async client => {
        const images = await requirePhysicalgoodsImageSlot(client, id);
        const order = images.length ? Math.max(...images.map(image => image.orden)) + 1 : 0;
        if (order > 32767) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'La publicación alcanzó el límite de imágenes del catálogo.');
        await insertPhysicalgoodsImage(client, id, imageId, path, photo, order);
        await touchPhysicalgoods(client, id);
      });
      return { id: imageId };
    } catch (error) {
      try { if (!attemptedPersistence || !await principalPhotoHasReference(path)) await removePrincipalPhoto(path); }
      catch { console.error('Physical resource image cleanup unavailable', { publicationId: id, imageId }); }
      throw error;
    }
  });
}
export async function changePhysicalgoodsPrincipal(auth: VerifiedAuthConnection, publicationId: unknown, imageId: unknown) {
  const id = physicalgoodsId(publicationId, 'publicationId'), selected = physicalgoodsId(imageId, 'imageId');
  return dependency(() => editPhysicalgoods(auth, id, async client => {
    const images = await findPhysicalgoodsImages(client, id), next = images.find(image => image.id === selected);
    if (!next) throw new ApiError(404, 'NOT_FOUND', 'La imagen no pertenece a esta publicación.');
    const previous = images.find(image => image.orden === 0);
    if (!previous) throw new Error('Principal image missing');
    if (next.id !== previous.id) { await setPhysicalgoodsPrincipal(client, id, next.id, previous.id, next.orden); await touchPhysicalgoods(client, id); }
    return { id: selected };
  }));
}
export async function deletePhysicalgoodsImage(auth: VerifiedAuthConnection, publicationId: unknown, imageId: unknown) {
  const id = physicalgoodsId(publicationId, 'publicationId'), selected = physicalgoodsId(imageId, 'imageId');
  return dependency(() => editPhysicalgoods(auth, id, async client => {
    const images = await findPhysicalgoodsImages(client, id), image = images.find(row => row.id === selected);
    if (!image) throw new ApiError(404, 'NOT_FOUND', 'La imagen no pertenece a esta publicación.');
    if (images.length === 1) throw new ApiError(400, 'VALIDATION_ERROR', 'La publicación debe conservar una fotografía principal.');
    await retirePhysicalgoodsImage(client, id, image.id);
    if (image.orden === 0) {
      const next = images.find(row => row.id !== selected)!;
      await setPhysicalgoodsPrincipal(client, id, next.id, next.id, 0);
    }
    await touchPhysicalgoods(client, id);
    return { id: selected };
  }));
}
export async function changePhysicalgoodsCategory(auth: VerifiedAuthConnection, publicationId: unknown, body: unknown) {
  const id = physicalgoodsId(publicationId, 'publicationId'), categoryId = parsePhysicalgoodsCategory(body);
  return dependency(() => editPhysicalgoods(auth, id, async client => {
    const category = await findPhysicalgoodsCategory(client, categoryId);
    if (!category?.activo) throw new ApiError(400, 'VALIDATION_ERROR', 'Selecciona una categoría activa.');
    await updatePhysicalgoodsCategory(client, id, categoryId); await touchPhysicalgoods(client, id);
    return { categoryId };
  }));
}
