import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '../../../services/api-response.js';
import { createPaginatedResult } from '../../../services/pagination.js';
import { requireCampusCapability } from '../../auth/auth.authorization.js';
import type { VerifiedAuthConnection } from '../../auth/auth.types.js';
import type { PhysicalgoodsMediaRow } from './physicalgoods.types.js';
import { parsePhysicalgoodsCategory, parsePhysicalgoodsPhotoUpload, physicalgoodsId } from './physicalgoods.validation.js';
import { lockPhysicalgoodsPublisher, PHYSICALGOODS_BUCKET, principalPhotoHasReference, removePrincipalPhoto,
  signPhysicalgoodsSearchPhotos, signPrincipalPhoto, uploadPrincipalPhoto, withPhysicalgoodsTransaction } from './physicalgoods.repository.js';
import { parsePhysicalgoodsSearch } from './physicalgoods.search.validation.js';
import { findPhysicalgoodsCategory, findPhysicalgoodsImages, findPhysicalgoodsMedia, insertPhysicalgoodsImage, listPhysicalgoodsMedia,
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
async function editPhysicalgoods<T>(auth: VerifiedAuthConnection, id: string, operation: (client: PoolClient, row: PhysicalgoodsMediaRow) => Promise<T>) {
  requireCampusCapability(auth, auth.campusId, 'general');
  return withPhysicalgoodsTransaction(async client => {
    const { profile, roles } = await lockPhysicalgoodsPublisher(client, auth.userId);
    if (!profile || profile.campus_id !== auth.campusId || profile.institucion_id !== auth.profile.institucion_id) throw new ApiError(409, 'CONFLICT', 'Tu contexto cambió. Recarga la publicación.');
    const current = { ...auth, profile, roles, campusId: profile.campus_id };
    requireCampusCapability(current, current.campusId, 'general');
    const row = await findPhysicalgoodsMedia(client, id, current.campusId, true);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu campus.');
    if (row.propietario_id !== current.userId) requireCampusCapability(current, row.campus_id, 'administration');
    return operation(client, row);
  });
}
export async function getPhysicalgoodsGallery(auth: VerifiedAuthConnection, publicationId: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const id = physicalgoodsId(publicationId, 'publicationId');
  return dependency(async () => {
    const result = await withPhysicalgoodsTransaction(async client => {
      const row = await findPhysicalgoodsMedia(client, id, auth.campusId);
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'La publicación no está disponible en tu campus.');
      return { row, images: await findPhysicalgoodsImages(client, id) };
    });
    const images = [];
    for (const image of result.images) {
      if (image.bucket_id !== PHYSICALGOODS_BUCKET || !image.storage_path.startsWith(auth.campusId + '/')) throw new Error('Invalid stored image');
      images.push({ id: image.id, name: image.nombre_original, principal: image.orden === 0, url: await signPrincipalPhoto(image.storage_path) });
    }
    return { ...mediaDto(result.row), canEdit: canEdit(auth, result.row), images, expiresIn: 60 };
  });
}
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
export async function addPhysicalgoodsImage(auth: VerifiedAuthConnection, publicationId: unknown, body: unknown) {
  requireCampusCapability(auth, auth.campusId, 'general');
  const id = physicalgoodsId(publicationId, 'publicationId'), photo = parsePhysicalgoodsPhotoUpload(body), imageId = randomUUID();
  const extension = photo.mimeType === 'image/jpeg' ? 'jpg' : photo.mimeType === 'image/png' ? 'png' : 'webp';
  const path = `${auth.campusId}/${auth.userId}/${id}/${imageId}.${extension}`;
  // Check ownership before Storage, then recheck account/grants and publication under the write lock.
  await dependency(() => editPhysicalgoods(auth, id, async () => {}));
  let attemptedPersistence = false;
  return dependency(async () => {
    try {
      await uploadPrincipalPhoto(path, photo);
      attemptedPersistence = true;
      await editPhysicalgoods(auth, id, async client => {
        const images = await findPhysicalgoodsImages(client, id);
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
